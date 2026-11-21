import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BufferGeometry, Camera, GeometryGroup, Material, Object3D } from 'three';
import { ACESFilmicToneMapping, BatchedMesh, BoxGeometry, BufferAttribute, Color, Fog, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshDepthMaterial, MeshStandardMaterial, NoToneMapping, PerspectiveCamera, Scene, SkinnedMesh, Texture } from 'three';
import { missingLines, threeFunction, threeSource } from '../../test/three-source-support.ts';
import { compiledProgramState, drawNeeds, formatProgramChanges, lineageOf, materialLabel, programChangeReasons, programChangeReport, watchProgramChanges } from './program-changes.ts';
import type { CompiledProgramState, DrawCall, DrawTarget, ProgramChangeReason, ProgramChangeRenderer, ProgramChangeReport, ProgramChangeWatch } from './program-changes.ts';

const ON_CANVAS: DrawTarget = { toneMapping: NoToneMapping, getRenderTarget: (): unknown => null };

function compiledFor(scene: Scene | null, geometry: BufferGeometry, material: Material, object: Object3D): CompiledProgramState {
  return drawNeeds(ON_CANVAS, scene, geometry, material, object);
}

function reasonsOf(scene: Scene | null, geometry: BufferGeometry, material: Material, object: Object3D, compiled: CompiledProgramState): ProgramChangeReason[] {
  return programChangeReasons(drawNeeds(ON_CANVAS, scene, geometry, material, object), compiled);
}

function box(): BufferGeometry {
  return new BoxGeometry(1, 1, 1);
}

void test('a draw that matches what its material was compiled for changes nothing', (): void => {
  const scene: Scene = new Scene();
  const geometry: BufferGeometry = box();
  const material: MeshStandardMaterial = new MeshStandardMaterial();
  const mesh: Mesh = new Mesh(geometry, material);
  assert.deepEqual(reasonsOf(scene, geometry, material, mesh, compiledFor(scene, geometry, material, mesh)), []);
});

void test('one material drawn by a plain mesh and then by an instanced, batched or skinned mesh changes program each time', (): void => {
  const scene: Scene = new Scene();
  const geometry: BufferGeometry = box();
  const material: MeshStandardMaterial = new MeshStandardMaterial();
  const plain: CompiledProgramState = compiledFor(scene, geometry, material, new Mesh(geometry, material));
  assert.deepEqual(reasonsOf(scene, geometry, material, new InstancedMesh(geometry, material, 2), plain), ['instancing']);
  assert.deepEqual(reasonsOf(scene, geometry, material, new BatchedMesh(1, 24, 36, material), plain), ['batching']);
  assert.deepEqual(reasonsOf(scene, geometry, material, new SkinnedMesh(geometry, material), plain), ['skinning']);
});

void test('instanced meshes with and without instance colours do not share a program', (): void => {
  const scene: Scene = new Scene();
  const geometry: BufferGeometry = box();
  const material: MeshStandardMaterial = new MeshStandardMaterial();
  const bare: InstancedMesh = new InstancedMesh(geometry, material, 2);
  const tinted: InstancedMesh = new InstancedMesh(geometry, material, 2);
  tinted.setColorAt(0, new Color(1, 0, 0));
  assert.deepEqual(reasonsOf(scene, geometry, material, tinted, compiledFor(scene, geometry, material, bare)), ['instancingColor']);
  assert.deepEqual(reasonsOf(scene, geometry, material, bare, compiledFor(scene, geometry, material, tinted)), ['instancingColor']);
});

void test('a batch with a colour texture and one without do not share a program', (): void => {
  const scene: Scene = new Scene();
  const geometry: BufferGeometry = box();
  const material: MeshStandardMaterial = new MeshStandardMaterial();
  const bare: BatchedMesh = new BatchedMesh(1, 24, 36, material);
  const tinted: BatchedMesh = new BatchedMesh(1, 24, 36, material);
  tinted.setColorAt(tinted.addInstance(tinted.addGeometry(geometry)), new Color(1, 0, 0));
  assert.deepEqual(reasonsOf(scene, geometry, material, tinted, compiledFor(scene, geometry, material, bare)), ['batchingColor']);
});

void test('a different scene fog, a vertex alpha attribute, tangents under a normal map and morph targets each change the program', (): void => {
  const scene: Scene = new Scene();
  const foggy: Scene = new Scene();
  foggy.fog = new Fog(0x000000, 1, 10);
  const geometry: BufferGeometry = box();
  const material: MeshStandardMaterial = new MeshStandardMaterial({ vertexColors: true });
  const mesh: Mesh = new Mesh(geometry, material);
  const compiled: CompiledProgramState = compiledFor(scene, geometry, material, mesh);
  assert.deepEqual(reasonsOf(foggy, geometry, material, mesh, compiled), ['fog']);
  const withAlpha: BufferGeometry = box();
  withAlpha.setAttribute('color', new BufferAttribute(new Float32Array(24 * 4), 4));
  assert.deepEqual(reasonsOf(scene, withAlpha, material, mesh, compiled), ['vertexAlphas']);
  const withTangents: BufferGeometry = box();
  withTangents.setAttribute('tangent', new BufferAttribute(new Float32Array(24 * 4), 4));
  assert.deepEqual(reasonsOf(scene, withTangents, material, mesh, compiled), [], 'tangents count only under a normal map');
  const bumpy: MeshStandardMaterial = new MeshStandardMaterial({ normalMap: new Texture() });
  assert.deepEqual(reasonsOf(scene, withTangents, bumpy, mesh, compiledFor(scene, geometry, bumpy, mesh)), ['vertexTangents']);
  const morphed: BufferGeometry = box();
  morphed.morphAttributes.position = [new BufferAttribute(new Float32Array(24 * 3), 3)];
  assert.deepEqual(reasonsOf(scene, morphed, material, mesh, compiled), ['morphTargets', 'morphTargetsCount']);
});

void test('a material without fog ignores the scene fog, and only lit materials follow the scene environment', (): void => {
  const scene: Scene = new Scene();
  const dressed: Scene = new Scene();
  dressed.fog = new Fog(0x000000, 1, 10);
  dressed.environment = new Texture();
  const geometry: BufferGeometry = box();
  const depth: MeshDepthMaterial = new MeshDepthMaterial();
  const lit: MeshStandardMaterial = new MeshStandardMaterial({ fog: false });
  const mesh: Mesh = new Mesh(geometry, depth);
  assert.deepEqual(reasonsOf(dressed, geometry, depth, mesh, compiledFor(scene, geometry, depth, mesh)), []);
  assert.deepEqual(reasonsOf(dressed, geometry, lit, mesh, compiledFor(scene, geometry, lit, mesh)), ['environment']);
});

void test('a tone-mapped material drawn to the canvas and to a render target changes program between them', (): void => {
  const scene: Scene = new Scene();
  const geometry: BufferGeometry = box();
  const material: MeshStandardMaterial = new MeshStandardMaterial();
  const mesh: Mesh = new Mesh(geometry, material);
  const toCanvas: DrawTarget = { toneMapping: ACESFilmicToneMapping, getRenderTarget: (): unknown => null };
  const toTarget: DrawTarget = { toneMapping: ACESFilmicToneMapping, getRenderTarget: (): unknown => ({}) };
  assert.deepEqual(programChangeReasons(drawNeeds(toTarget, scene, geometry, material, mesh), drawNeeds(toCanvas, scene, geometry, material, mesh)), ['toneMapping']);
});

void test('a bumped material version is the only reason reported, as three rebuilds everything then', (): void => {
  const scene: Scene = new Scene();
  const geometry: BufferGeometry = box();
  const material: MeshStandardMaterial = new MeshStandardMaterial();
  const compiled: CompiledProgramState = compiledFor(scene, geometry, material, new Mesh(geometry, material));
  material.needsUpdate = true;
  assert.deepEqual(reasonsOf(scene, geometry, material, new InstancedMesh(geometry, material, 2), compiled), ['version']);
});

void test('the compiled state of a material three has never drawn is null', (): void => {
  assert.equal(compiledProgramState({}), null);
  assert.equal(compiledProgramState(undefined), null);
  assert.equal(compiledProgramState({ __version: 3, instancing: true })?.instancing, true);
});

void test('a material is named by its type, name and id, and an object with up to three ancestors', (): void => {
  assert.match(materialLabel(new MeshStandardMaterial({ name: 'cave wall' })), /^MeshStandardMaterial "cave wall" #\d+$/);
  const scene: Scene = new Scene();
  const zone: Group = new Group();
  const cell: Group = new Group();
  const prop: Group = new Group();
  const pillar: Mesh = new Mesh();
  zone.name = 'zone';
  pillar.name = 'pillar';
  scene.add(zone);
  zone.add(cell);
  cell.add(prop);
  prop.add(pillar);
  assert.equal(lineageOf(pillar), 'Mesh "pillar" under Group < Group < Group "zone"');
  assert.equal(lineageOf(scene), 'Scene');
});

interface FakeProperties {
  __version?: number;
  instancing?: boolean;
  lightsStateVersion?: number;
  currentProgram?: object;
}

interface FakeRenderer extends ProgramChangeRenderer {
  readonly drawn: Object3D[];
  readonly compiled: Map<object, FakeProperties>;
  onDraw: (properties: FakeProperties) => void;
}

function fakeRenderer(): FakeRenderer {
  const compiled: Map<object, FakeProperties> = new Map<object, FakeProperties>();
  const drawn: Object3D[] = [];
  const renderer: FakeRenderer = {
    toneMapping: NoToneMapping,
    drawn,
    compiled,
    onDraw: (): void => undefined,
    properties: { get: (material: object): unknown => compiled.get(material) },
    getRenderTarget: (): unknown => null,
    renderBufferDirect: (_camera: Camera, _scene: Scene, _geometry: BufferGeometry, material: Material, object: Object3D): void => {
      drawn.push(object);
      const properties: FakeProperties | undefined = compiled.get(material);
      if (properties !== undefined) renderer.onDraw(properties);
    },
  };
  return renderer;
}

const CAMERA: Camera = new PerspectiveCamera();
const GROUP: GeometryGroup = { start: 0, count: 0, materialIndex: 0 };

function drawWith(renderer: ProgramChangeRenderer, scene: Scene, mesh: Mesh<BufferGeometry, Material>): void {
  renderer.renderBufferDirect(CAMERA, scene, mesh.geometry, mesh.material, mesh, GROUP);
}

void test('the watch counts draws, names the mismatch, and still draws through the renderer', (): void => {
  const renderer: FakeRenderer = fakeRenderer();
  const scene: Scene = new Scene();
  const material: MeshDepthMaterial = new MeshDepthMaterial();
  const plain: Mesh<BufferGeometry, Material> = new Mesh(box(), material);
  const instanced: InstancedMesh<BufferGeometry, Material> = new InstancedMesh(box(), material, 2);
  instanced.name = 'loot';
  scene.add(plain, instanced);
  renderer.compiled.set(material, { __version: material.version, instancing: false });
  const watch: ProgramChangeWatch = watchProgramChanges(renderer);
  drawWith(renderer, scene, plain);
  drawWith(renderer, scene, instanced);
  drawWith(renderer, scene, instanced);
  assert.deepEqual(renderer.drawn, [plain, instanced, instanced]);
  assert.equal(watch.tally.draws, 3);
  assert.equal(watch.tally.changedDraws, 2);
  assert.deepEqual([...watch.tally.counts.values()], [{ reason: 'instancing', material: materialLabel(material), object: 'InstancedMesh "loot" under Scene', surface: 'canvas', count: 2 }]);
  watch.stop();
});

void test('a draw that moves the light state version is a lights change, and one that only swaps the program is unknown', (): void => {
  const renderer: FakeRenderer = fakeRenderer();
  const scene: Scene = new Scene();
  const material: MeshStandardMaterial = new MeshStandardMaterial();
  const mesh: Mesh<BufferGeometry, Material> = new Mesh(box(), material);
  scene.add(mesh);
  renderer.compiled.set(material, { ...compiledFor(scene, mesh.geometry, material, mesh), __version: material.version, lightsStateVersion: 1, currentProgram: {} });
  const watch: ProgramChangeWatch = watchProgramChanges(renderer);
  renderer.onDraw = (properties: FakeProperties): void => {
    properties.lightsStateVersion = 2;
  };
  drawWith(renderer, scene, mesh);
  renderer.onDraw = (properties: FakeProperties): void => {
    properties.currentProgram = {};
  };
  drawWith(renderer, scene, mesh);
  renderer.onDraw = (): void => undefined;
  drawWith(renderer, scene, mesh);
  assert.deepEqual([...watch.tally.counts.values()].map((entry: { readonly reason: ProgramChangeReason; readonly count: number }): [ProgramChangeReason, number] => [entry.reason, entry.count]), [['lights', 1], ['unknown', 1]]);
  assert.equal(watch.tally.changedDraws, 2);
  watch.stop();
});

void test('a material three has not compiled yet is drawn but not counted, and stop puts the renderer method back', (): void => {
  const renderer: FakeRenderer = fakeRenderer();
  const scene: Scene = new Scene();
  const original: DrawCall = renderer.renderBufferDirect;
  const mesh: Mesh<BufferGeometry, Material> = new Mesh(box(), new MeshBasicMaterial());
  const watch: ProgramChangeWatch = watchProgramChanges(renderer);
  assert.notEqual(renderer.renderBufferDirect, original);
  drawWith(renderer, scene, mesh);
  assert.equal(renderer.drawn.length, 1);
  assert.equal(watch.tally.draws, 0);
  assert.equal(watch.stop(), watch.tally);
  assert.equal(renderer.renderBufferDirect, original);
});

void test('stop leaves a later wrapper in place and stops counting through it', (): void => {
  const renderer: FakeRenderer = fakeRenderer();
  const scene: Scene = new Scene();
  const material: MeshDepthMaterial = new MeshDepthMaterial();
  const mesh: Mesh<BufferGeometry, Material> = new Mesh(box(), material);
  renderer.compiled.set(material, { __version: material.version });
  const watch: ProgramChangeWatch = watchProgramChanges(renderer);
  const watched: DrawCall = renderer.renderBufferDirect;
  const later: DrawCall = (camera: Camera, drawn: Scene, geometry: BufferGeometry, used: Material, object: Object3D, group: GeometryGroup): void => {
    watched(camera, drawn, geometry, used, object, group);
  };
  renderer.renderBufferDirect = later;
  watch.stop();
  assert.equal(renderer.renderBufferDirect, later);
  drawWith(renderer, scene, mesh);
  assert.equal(renderer.drawn.length, 1);
  assert.equal(watch.tally.draws, 0);
});

void test('overlapping watches count the same draws and put the renderer method back whichever stops first', (): void => {
  for (const firstStopsFirst of [true, false]) {
    const renderer: FakeRenderer = fakeRenderer();
    const scene: Scene = new Scene();
    const material: MeshDepthMaterial = new MeshDepthMaterial();
    const original: DrawCall = renderer.renderBufferDirect;
    const instanced: InstancedMesh<BufferGeometry, Material> = new InstancedMesh(box(), material, 2);
    renderer.compiled.set(material, { __version: material.version });
    const first: ProgramChangeWatch = watchProgramChanges(renderer);
    drawWith(renderer, scene, instanced);
    const second: ProgramChangeWatch = watchProgramChanges(renderer);
    drawWith(renderer, scene, instanced);
    assert.deepEqual([first.tally.draws, first.tally.changedDraws, second.tally.draws, second.tally.changedDraws], [2, 2, 1, 1]);
    assert.equal(renderer.drawn.length, 2, 'each draw reaches the renderer once');
    const early: ProgramChangeWatch = firstStopsFirst ? first : second;
    const late: ProgramChangeWatch = firstStopsFirst ? second : first;
    early.stop();
    assert.notEqual(renderer.renderBufferDirect, original);
    drawWith(renderer, scene, instanced);
    assert.equal(late.tally.draws, firstStopsFirst ? 2 : 3);
    late.stop();
    assert.equal(renderer.renderBufferDirect, original);
  }
});

void test('a report is per frame with the largest row first, and a report over no frames is all zeroes', (): void => {
  const renderer: FakeRenderer = fakeRenderer();
  const scene: Scene = new Scene();
  const material: MeshDepthMaterial = new MeshDepthMaterial();
  const plain: Mesh<BufferGeometry, Material> = new Mesh(box(), material);
  const instanced: InstancedMesh<BufferGeometry, Material> = new InstancedMesh(box(), material, 2);
  const skinned: SkinnedMesh<BufferGeometry, Material> = new SkinnedMesh(box(), material);
  renderer.compiled.set(material, { __version: material.version });
  const watch: ProgramChangeWatch = watchProgramChanges(renderer);
  for (let frame: number = 1; frame <= 4; frame += 1) {
    drawWith(renderer, scene, plain);
    drawWith(renderer, scene, instanced);
    if (frame % 2 === 0) drawWith(renderer, scene, skinned);
  }
  const report: ProgramChangeReport = programChangeReport(watch.stop(), 4);
  assert.equal(report.drawsPerFrame, 2.5);
  assert.equal(report.changedDrawsPerFrame, 1.5);
  assert.deepEqual(report.byReason, [{ reason: 'instancing', perFrame: 1 }, { reason: 'skinning', perFrame: 0.5 }]);
  assert.equal(formatProgramChanges(report, 1), `program changes: 1.5 of 3 draws per frame over 4 frames (instancing 1.0, skinning 0.5)\n  1.00/frame instancing: ${materialLabel(material)} on InstancedMesh, drawn to the canvas`);
  const empty: ProgramChangeReport = programChangeReport({ draws: 0, changedDraws: 0, counts: new Map() }, 0);
  assert.equal(formatProgramChanges(empty, 5), 'program changes: 0.0 of 0 draws per frame over 0 frames');
});

const MIRRORED_CONDITIONS: readonly string[] = [
  'material.version === materialProperties.__version',
  'materialProperties.lightsStateVersion !== lights.state.version',
  'object.isBatchedMesh && materialProperties.batching === false',
  '! object.isBatchedMesh && materialProperties.batching === true',
  'materialProperties.batchingColor === true && object._colorsTexture === null',
  'materialProperties.batchingColor === false && object._colorsTexture !== null',
  'object.isInstancedMesh && materialProperties.instancing === false',
  '! object.isInstancedMesh && materialProperties.instancing === true',
  'object.isSkinnedMesh && materialProperties.skinning === false',
  '! object.isSkinnedMesh && materialProperties.skinning === true',
  'materialProperties.instancingColor === true && object.instanceColor === null',
  'materialProperties.instancingColor === false && object.instanceColor !== null',
  'materialProperties.envMap !== envMap',
  'material.fog === true && materialProperties.fog !== fog',
  'materialProperties.vertexAlphas !== vertexAlphas',
  'materialProperties.vertexTangents !== vertexTangents',
  'materialProperties.morphTargets !== morphTargets',
  'materialProperties.toneMapping !== toneMapping',
  'materialProperties.morphTargetsCount !== morphTargetsCount',
];

const UNMIRRORED_CONDITIONS: readonly string[] = [
  'materialProperties.outputColorSpace !== colorSpace',
  'materialProperties.instancingMorph === true && object.morphTexture === null',
  'materialProperties.instancingMorph === false && object.morphTexture !== null',
  'materialProperties.numClippingPlanes !== clipping.numPlanes',
  'materialProperties.morphNormals !== morphNormals',
  'materialProperties.morphColors !== morphColors',
  '!! materialProperties.lightProbeGrid',
];

const PROGRAM_CHANGE_BRANCHES_IN_THREE: number = 26;

void test('three still decides a program change by the conditions this module mirrors', (): void => {
  const setProgram: string = threeFunction(threeSource('renderers', 'WebGLRenderer.js'), 'function setProgram(');
  assert.deepEqual(missingLines(setProgram, [...MIRRORED_CONDITIONS, ...UNMIRRORED_CONDITIONS]), []);
  assert.equal(setProgram.split('needsProgramChange = true').length - 1, PROGRAM_CHANGE_BRANCHES_IN_THREE, 'setProgram gained or lost a program-change branch: mirror it in programChangeReasons or list it as unmirrored');
  assert.equal(MIRRORED_CONDITIONS.length + UNMIRRORED_CONDITIONS.length, PROGRAM_CHANGE_BRANCHES_IN_THREE);
});

void test('three still draws both passes through the renderer instance and sets the fields the watch reads', (): void => {
  const renderer: string = threeSource('renderers', 'WebGLRenderer.js');
  const shadows: string = threeSource('renderers', 'webgl', 'WebGLShadowMap.js');
  assert.ok(renderer.includes('this.renderBufferDirect = function'), 'renderBufferDirect is no longer an instance field');
  assert.ok(renderer.includes('_this.renderBufferDirect('), 'the main pass no longer draws through the instance method');
  assert.ok(shadows.includes('renderer.renderBufferDirect('), 'the shadow pass no longer draws through the instance method');
  assert.deepEqual(missingLines(renderer, [
    'materialProperties.environment = ( material.isMeshStandardMaterial || material.isMeshLambertMaterial || material.isMeshPhongMaterial ) ? scene.environment : null;',
    'materialProperties.fog = scene.fog;',
    'materialProperties.currentProgram = program;',
    'materialProperties.lightsStateVersion = lightsStateVersion;',
    'const vertexAlphas = material.vertexColors === true && !! geometry.attributes.color && geometry.attributes.color.itemSize === 4;',
    'const vertexTangents = !! geometry.attributes.tangent && ( !! material.normalMap || material.anisotropy > 0 );',
    'const morphTargets = !! geometry.morphAttributes.position;',
  ]), []);
});
