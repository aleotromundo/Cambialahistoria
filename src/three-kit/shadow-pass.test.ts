import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BufferGeometry, Camera, GeometryGroup, Light, Material, Object3D } from 'three';
import { BoxGeometry, DirectionalLight, InstancedMesh, LightShadow, Mesh, MeshStandardMaterial, OrthographicCamera, PerspectiveCamera, Scene, SkinnedMesh } from 'three';
import { missingLines, threeFunction, threeSource } from '../../test/three-source-support.ts';
import type { DrawCall } from './program-changes.ts';
import { shadowPassReport, watchShadowPass } from './shadow-pass.ts';
import type { ShadowKindRate, ShadowPassReport, ShadowPassTally, ShadowPassWatch, ShadowRender } from './shadow-pass.ts';

const BOX_TRIANGLES = 12;
const WHOLE: GeometryGroup = { start: 0, count: Infinity };

interface FakeCounts {
  calls: number;
  triangles: number;
}

interface FakeShadowMap {
  enabled: boolean;
  render: ShadowRender;
}

interface FakeRenderer {
  renderBufferDirect: DrawCall;
  readonly shadowMap: FakeShadowMap;
  readonly info: { readonly render: FakeCounts };
}

function trianglesOf(geometry: BufferGeometry, object: Object3D): number {
  const index: number = geometry.index === null ? geometry.getAttribute('position').count : geometry.index.count;
  return (index / 3) * (object instanceof InstancedMesh ? object.count : 1);
}

function fakeRenderer(): FakeRenderer {
  const counts: FakeCounts = { calls: 0, triangles: 0 };
  const shadowCamera: OrthographicCamera = new OrthographicCamera();
  const renderer: FakeRenderer = {
    info: { render: counts },
    renderBufferDirect: (_camera: Camera, _scene: Scene, geometry: BufferGeometry, _material: Material, object: Object3D): void => {
      counts.calls += 1;
      counts.triangles += trianglesOf(geometry, object);
    },
    shadowMap: {
      enabled: true,
      render: (lights: Light[], scene: Scene): void => {
        for (const light of lights) {
          const shadow: unknown = Reflect.get(light, 'shadow');
          if (shadow instanceof LightShadow) shadow.matrix.copy(light.matrixWorld);
          for (const mesh of castersOf(scene)) {
            const materials: readonly Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const material of materials) renderer.renderBufferDirect(shadowCamera, scene, mesh.geometry, material, mesh, WHOLE);
          }
        }
      },
    },
  };
  return renderer;
}


interface Stage {
  readonly scene: Scene;
  readonly casters: Mesh[];
  readonly sun: DirectionalLight;
  readonly lights: Light[];
  readonly camera: PerspectiveCamera;
}

const staged: WeakMap<Scene, Stage> = new WeakMap<Scene, Stage>();

function stage(): Stage {
  const scene: Scene = new Scene();
  const sun: DirectionalLight = new DirectionalLight();
  sun.castShadow = true;
  scene.add(sun);
  const made: Stage = { scene, casters: [], sun, lights: [sun], camera: new PerspectiveCamera() };
  staged.set(scene, made);
  return made;
}

function castersOf(scene: Scene): readonly Mesh[] {
  return staged.get(scene)?.casters ?? [];
}

function add(at: Stage, ...meshes: readonly Mesh[]): void {
  for (const mesh of meshes) {
    mesh.castShadow = true;
    at.casters.push(mesh);
    at.scene.add(mesh);
  }
}

function frame(renderer: FakeRenderer, at: Stage): void {
  at.scene.updateMatrixWorld();
  renderer.shadowMap.render(at.lights, at.scene, at.camera);
  for (const mesh of at.casters) {
    const material: Material | undefined = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (material !== undefined) renderer.renderBufferDirect(at.camera, at.scene, mesh.geometry, material, mesh, WHOLE);
  }
}

void test('the shadow pass is counted apart from the main pass, split by the kind of caster', (): void => {
  const at: Stage = stage();
  const geometry: BoxGeometry = new BoxGeometry();
  const material: MeshStandardMaterial = new MeshStandardMaterial();
  add(at, new Mesh(geometry, material), new SkinnedMesh(geometry, material), new InstancedMesh(geometry, material, 5));
  const renderer: FakeRenderer = fakeRenderer();
  const watch: ShadowPassWatch = watchShadowPass(renderer);
  frame(renderer, at);
  frame(renderer, at);
  const tally: ShadowPassTally = watch.stop();
  assert.equal(tally.passes, 2);
  assert.equal(tally.draws, 6);
  assert.equal(tally.triangles, 2 * (BOX_TRIANGLES + BOX_TRIANGLES + 5 * BOX_TRIANGLES));
  assert.equal(tally.allDraws, 12);
  assert.equal(tally.allTriangles, 2 * tally.triangles);
  assert.deepEqual(tally.kinds.still, { draws: 2, triangles: 2 * BOX_TRIANGLES });
  assert.deepEqual(tally.kinds.skinned, { draws: 2, triangles: 2 * BOX_TRIANGLES });
  assert.deepEqual(tally.kinds.instanced, { draws: 2, triangles: 2 * 5 * BOX_TRIANGLES });
  assert.deepEqual(tally.kinds.moved, { draws: 0, triangles: 0 });
});

void test('a caster whose world matrix changed since its last shadow draw is moved, and each of its groups agrees', (): void => {
  const at: Stage = stage();
  const geometry: BoxGeometry = new BoxGeometry();
  const walker: Mesh = new Mesh(geometry, [new MeshStandardMaterial(), new MeshStandardMaterial()]);
  add(at, walker, new Mesh(geometry, new MeshStandardMaterial()));
  const renderer: FakeRenderer = fakeRenderer();
  const watch: ShadowPassWatch = watchShadowPass(renderer);
  frame(renderer, at);
  walker.position.x += 1;
  frame(renderer, at);
  frame(renderer, at);
  const tally: ShadowPassTally = watch.stop();
  assert.deepEqual(tally.kinds.moved, { draws: 2, triangles: 2 * BOX_TRIANGLES });
  assert.deepEqual(tally.kinds.still, { draws: 7, triangles: 7 * BOX_TRIANGLES });
});

void test('a pass counts as moved when a light shadow view changed since the previous pass', (): void => {
  const at: Stage = stage();
  add(at, new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
  const renderer: FakeRenderer = fakeRenderer();
  const watch: ShadowPassWatch = watchShadowPass(renderer);
  frame(renderer, at);
  frame(renderer, at);
  at.sun.position.x += 0.5;
  frame(renderer, at);
  at.sun.position.x += 0.5;
  frame(renderer, at);
  const tally: ShadowPassTally = watch.stop();
  assert.equal(tally.passes, 4);
  assert.equal(tally.movedPasses, 2);
  const report: ShadowPassReport = shadowPassReport(tally, 4);
  assert.equal(report.passesPerFrame, 1);
  assert.equal(report.movedPassShare, 0.5);
  assert.equal(report.drawsPerFrame, 1);
});

void test('a scene with no shadow lights or with shadows off is not a pass', (): void => {
  const at: Stage = stage();
  add(at, new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
  const renderer: FakeRenderer = fakeRenderer();
  const watch: ShadowPassWatch = watchShadowPass(renderer);
  renderer.shadowMap.render([], at.scene, at.camera);
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.render(at.lights, at.scene, at.camera);
  assert.equal(watch.stop().passes, 0);
});

void test('stopping puts both methods back, and a watch stopped under a later wrapper stops counting and leaves it in place', (): void => {
  const at: Stage = stage();
  add(at, new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
  const renderer: FakeRenderer = fakeRenderer();
  const draw: DrawCall = renderer.renderBufferDirect;
  const render: ShadowRender = renderer.shadowMap.render;
  watchShadowPass(renderer).stop();
  assert.equal(renderer.renderBufferDirect, draw);
  assert.equal(renderer.shadowMap.render, render);
  const lower: ShadowPassWatch = watchShadowPass(renderer);
  const upper: ShadowPassWatch = watchShadowPass(renderer);
  const upperDraw: DrawCall = renderer.renderBufferDirect;
  lower.stop();
  assert.equal(renderer.renderBufferDirect, upperDraw);
  frame(renderer, at);
  assert.equal(lower.tally.passes, 0);
  assert.equal(upper.stop().passes, 1);
  assert.equal(upper.tally.draws, 1);
});

void test('the report of an empty window is zero everywhere', (): void => {
  const report: ShadowPassReport = shadowPassReport(watchShadowPass(fakeRenderer()).stop(), 0);
  assert.equal(report.passesPerFrame, 0);
  assert.equal(report.movedPassShare, 0);
  assert.deepEqual(report.kinds.map((rate: ShadowKindRate): number => rate.drawsPerFrame), [0, 0, 0, 0]);
});

void test('three still renders shadows through an instance field of its shadow map, called once per render', (): void => {
  const shadowMap: string = threeSource('renderers', 'webgl', 'WebGLShadowMap.js');
  assert.deepEqual(missingLines(shadowMap, ['\tthis.render = function ( lights, scene, camera ) {', 'if ( light.isPointLight !== true ) shadow.updateMatrices( light, camera );']), []);
  assert.deepEqual(missingLines(threeFunction(shadowMap, 'function renderObject( object, camera, shadowCamera, light, type ) {'), [
    'renderer.renderBufferDirect( shadowCamera, null, geometry, depthMaterial, object, group );',
    'renderer.renderBufferDirect( shadowCamera, null, geometry, depthMaterial, object, null );',
  ]), []);
  assert.deepEqual(missingLines(threeSource('renderers', 'WebGLRenderer.js'), ['shadowMap.render( shadowsArray, scene, camera );']), []);
});

void test('three still writes a light shadow matrix when it updates the shadow view, and counts every draw in its info', (): void => {
  assert.deepEqual(missingLines(threeSource('lights', 'LightShadow.js'), ['\tupdateMatrices( light ) {', 'shadowMatrix.multiply( _projScreenMatrix );']), []);
  assert.deepEqual(missingLines(threeSource('renderers', 'webgl', 'WebGLInfo.js'), ['render.calls ++;', 'render.triangles += instanceCount * ( count / 3 );']), []);
});
