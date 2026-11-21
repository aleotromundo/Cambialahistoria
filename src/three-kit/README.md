# three-kit

Small modules that measure or tune three.js for this game without forking it. three.js stays a plain dependency pinned in `package.json`; everything here is ours, and an upgrade either keeps working or fails a test here.

The same approach, and the program-change meter, come from Movement Lab's `src/three-kit/`. When one side improves a shared module, port it to the other.

## Rules

- Public seams only: fields on the renderer instance (`renderBufferDirect`, `properties`, `info`), object hooks (`updateMatrixWorld` on a subclass, `customDepthMaterial`, `onBeforeCompile`), methods on objects we own (a skeleton's `update`, a bone rotation's `setFromQuaternion`), and the strings in `ShaderChunk`. Nothing here edits files in `node_modules` or copies three.js source.
- One module per file, with its test next to it.
- Every module that depends on how three.js works inside has an anchor test: it reads the lines it depends on from `node_modules/three/src` (`test/three-source-support.ts`) or from `ShaderChunk`, and fails when they are gone. A three.js upgrade then fails a test instead of silently undoing a patch. To upgrade, bump `three`, run `npm test`, and fix or drop each module whose anchor fails.
- A module that changes behaviour is measured before and after with the fight bench (`node tools/fight-bench.ts`), and the pull request carries the numbers. Counts (draws, program changes) are preferred over milliseconds, because they do not move with the load on the machine.
- A measuring module costs nothing in play: it is installed only while the fight bench measures.

## Modules

### program-changes.ts

Counts the draws for which three re-derives a shader program. Its `setProgram` does that when the material's compiled state does not match the draw (`needsProgramChange`). Nothing is compiled, but each such draw runs `getProgram`, `getParameters` and `getProgramCacheKey`, which was about a tenth of frame script time in Movement Lab before it was fixed there.

`watchProgramChanges(renderer)` wraps the renderer instance's `renderBufferDirect`, which the main pass and the shadow pass both draw through, and compares `renderer.properties.get(material)` with what the draw needs. Overlapping watches share one wrapper, and the last one to stop puts the method back. The fight bench watches its measured window and prints the result on the `programs` line, with the largest rows under it.

| Reason | The material was compiled for | Usual cause |
|---|---|---|
| `version` | an older `material.version` | `needsUpdate = true` set every frame, or a material that is `transparent` and `DoubleSide` without `forceSinglePass` |
| `batching`, `instancing`, `skinning` | a different kind of mesh | one material shared by plain, instanced, batched and skinned meshes |
| `batchingColor`, `instancingColor` | a mesh with or without per-instance colours | one material shared by tinted and untinted batches |
| `fog`, `environment` | another scene's fog or environment | one material drawn in two scenes, such as the game and the item pictures |
| `vertexAlphas`, `vertexTangents`, `morphTargets`, `morphTargetsCount` | a geometry with different attributes | one material over geometries with and without those attributes |
| `toneMapping` | the other kind of draw surface | a tone-mapped material drawn to the canvas and to a render target |
| `lights` | another light state | the scene drawn twice a frame with different lights in view |
| `unknown` | something three checks that this module does not mirror | output colour space, instanced morphs, morph normals or colours, clipping planes, light probe grids |

The fix is nearly always to stop sharing: give each kind of draw its own material, so each keeps its own program.

### shadow-pass.ts

Counts what the shadow map costs each frame. `watchShadowPass(renderer)` wraps the shadow map's `render` (an instance field) to mark the pass, and `renderBufferDirect` to read `renderer.info.render` around every draw, so its numbers are three's own. It reports shadow passes, draws and triangles per frame beside every draw of the frame, how often a light's shadow view moved between passes (a cached map would have to be redrawn that often), and the split by caster:

| Kind | The caster |
|---|---|
| `still` | a plain mesh with the same world matrix as at its last shadow draw |
| `moved` | a plain mesh whose world matrix changed since its last shadow draw |
| `skinned` | a skinned mesh, which changes shape every frame it animates |
| `instanced` | an instanced or batched mesh |

The fight bench watches its measured window and prints the `shadows` line. Each watch puts the methods back only while it is still the outermost wrapper, so the bench stops it before the program-change meter.

### steady-shadows.ts

Gives every shadow caster a shared depth material fixed for its kind (skinned or rigid, instanced, morphs, map, side), so the shadow pass never changes a depth program because of draw order. three dresses whichever depth material it uses from the caster's material on every draw, so the shadow does not change. A caster whose material three would give a depth material of its own (alpha-tested map, alpha map, displacement, alpha to coverage, clipping planes) is left to three.

### resting-group.ts

A `Group` whose `updateMatrixWorld` does nothing while it rests and is hidden. A monster's rig root is one: every rig is in the scene from the zone's load, and three updates the matrices of hidden objects too, which in the first cave was 11,837 of 14,019 scene objects and 1.84 ms a frame.

### pose-once.ts

three poses a skeleton once per value of its frame counter, and it bumps that counter between walking the scene and drawing the shadow pass, so every skeleton that casts a shadow computed its bone matrices twice a frame. `poseOncePerTick` holds a skeleton to one pose per stage render, and `nextPoseTick`, which the stage calls at the start of each render, starts the next one.

### quiet-bones.ts

An animated bone's quaternion changes every frame, and three rebuilds its Euler `rotation` from it every time. Nothing in the game reads a bone's Euler angles, so `quietBones` makes that rebuild do nothing. Setting a bone by its angles still turns it.

### dark-lights.ts

Edits `lights_fragment_begin` so the shader skips the direct-light maths for a point or spot light that adds nothing to the pixel: a light at zero intensity, or a pixel past its cutoff distance. three already marks such a light not visible, and every term of the skipped call is scaled by its colour, so the picture does not change. The number of lights and the programs are unchanged.
