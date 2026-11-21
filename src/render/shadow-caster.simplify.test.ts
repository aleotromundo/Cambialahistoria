import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Sphere } from 'three';
import { Bone, BufferAttribute, BufferGeometry, Frustum, Matrix4, MeshStandardMaterial, OrthographicCamera, Scene, Skeleton, SkinnedMesh } from 'three';
import { must } from '../../test/support.ts';
import type { CasterArrays } from './shadow-caster.ts';
import { casterGeometry, casterSimplifierReady, createShadowCaster, fitCaster, SHADOW_CASTER, simplifiedIndex, weldCaster } from './shadow-caster.ts';

const GRID = {
  cells: 20,
  rough: 0.5,
  stepX: 7,
  stepZ: 13,
  stepXZ: 5,
  wrap: 11,
  centre: 0.5,
  farLimb: 6,
} as const;

function skinOf(count: number, joint: number): { readonly joints: Uint16Array; readonly weights: Float32Array } {
  const joints: Uint16Array = new Uint16Array(count * 4);
  const weights: Float32Array = new Float32Array(count * 4);
  for (let vertex: number = 0; vertex < count; vertex += 1) {
    joints[vertex * 4] = joint;
    weights[vertex * 4] = 1;
  }
  return { joints, weights };
}

function grid(height: (x: number, z: number) => number): CasterArrays {
  const side: number = GRID.cells + 1;
  const positions: Float32Array = new Float32Array(side * side * 3);
  for (let z: number = 0; z < side; z += 1) {
    for (let x: number = 0; x < side; x += 1) positions.set([x / GRID.cells, height(x, z), z / GRID.cells], (z * side + x) * 3);
  }
  const indices: number[] = [];
  for (let z: number = 0; z < GRID.cells; z += 1) {
    for (let x: number = 0; x < GRID.cells; x += 1) {
      const at: number = z * side + x;
      indices.push(at, at + side, at + 1, at + 1, at + side, at + side + 1);
    }
  }
  return { positions, ...skinOf(side * side, 0), indices: new Uint32Array(indices) };
}

function gridGeometry(arrays: CasterArrays): BufferGeometry {
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(arrays.positions, 3));
  geometry.setAttribute('skinIndex', new BufferAttribute(arrays.joints, 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(arrays.weights, 4));
  geometry.setIndex(new BufferAttribute(arrays.indices, 1));
  return geometry;
}

void test('vertices split only for colour seams are welded, and a vertex weighted to another joint stays its own', (): void => {
  const positions: Float32Array = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 1, 1, 0]);
  const skin: { readonly joints: Uint16Array; readonly weights: Float32Array } = skinOf(7, 2);
  skin.joints[6 * 4] = 3;
  const welded: CasterArrays = weldCaster({ positions, ...skin, indices: new Uint32Array([0, 1, 2, 3, 5, 4, 2, 1, 6]) });
  assert.equal(welded.positions.length / 3, 5);
  assert.deepEqual([...welded.indices], [0, 1, 2, 1, 3, 2, 2, 1, 4]);
  assert.deepEqual([...welded.joints].filter((_joint: number, at: number): boolean => at % 4 === 0), [2, 2, 2, 2, 3]);
  assert.deepEqual([...welded.weights].filter((_weight: number, at: number): boolean => at % 4 === 0), [1, 1, 1, 1, 1]);
});

void test('a flat caster is cut down to a small share of its triangles', async (): Promise<void> => {
  assert.equal(await casterSimplifierReady(), true);
  const flat: CasterArrays = grid((): number => 0);
  const kept: Uint32Array = simplifiedIndex(flat.indices, flat.positions);
  assert.ok(kept.length > 0);
  assert.ok(kept.length <= flat.indices.length * SHADOW_CASTER.keepShare);
});

void test('a caster whose outline the error bound protects keeps more than the share', async (): Promise<void> => {
  await casterSimplifierReady();
  const rough: CasterArrays = grid((x: number, z: number): number => GRID.rough * (((x * GRID.stepX + z * GRID.stepZ + x * z * GRID.stepXZ) % GRID.wrap) / GRID.wrap - GRID.centre));
  const kept: Uint32Array = simplifiedIndex(rough.indices, rough.positions);
  assert.ok(kept.length > rough.indices.length * SHADOW_CASTER.keepShare);
  assert.ok(kept.length <= rough.indices.length);
});

void test('a caster under the size worth simplifying keeps every triangle', async (): Promise<void> => {
  await casterSimplifierReady();
  const indices: Uint32Array = new Uint32Array(Array.from({ length: (SHADOW_CASTER.simplifyFrom - 1) * 3 }, (_unused: unknown, at: number): number => at % 3));
  const positions: Float32Array = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  assert.equal(simplifiedIndex(indices, positions), indices);
});

void test('the merged caster geometry carries the simplified index over the welded vertices', async (): Promise<void> => {
  await casterSimplifierReady();
  const flat: CasterArrays = grid((): number => 0);
  const merged: BufferGeometry = casterGeometry([{ geometry: gridGeometry(flat), bindMatrix: new Matrix4(), ranges: null }], new Matrix4());
  assert.ok(must(merged.index, 'index').count <= flat.indices.length * SHADOW_CASTER.keepShare);
  assert.equal(must(merged.attributes['position'], 'position').count, flat.positions.length / 3);
});

void test('a caster is bounded by the whole merged geometry, padded, and culled outside the shadow view', (): void => {
  const bone: Bone = new Bone();
  const anchor: SkinnedMesh = new SkinnedMesh(gridGeometry(grid((): number => 0)), new MeshStandardMaterial());
  anchor.add(bone);
  anchor.bind(new Skeleton([bone]), new Matrix4());
  const caster: SkinnedMesh = createShadowCaster(anchor);
  assert.equal(caster.frustumCulled, false);
  const far: CasterArrays = grid((): number => 0);
  for (let at: number = 0; at < far.positions.length; at += 3) far.positions[at] = (far.positions[at] ?? 0) + GRID.farLimb;
  const merged: BufferGeometry = casterGeometry([{ geometry: gridGeometry(grid((): number => 0)), bindMatrix: new Matrix4(), ranges: null }, { geometry: gridGeometry(far), bindMatrix: new Matrix4(), ranges: null }], new Matrix4());
  fitCaster(caster, merged);
  assert.equal(caster.geometry, merged);
  assert.equal(caster.frustumCulled, true);
  const sphere: Sphere = must(merged.boundingSphere, 'bounds');
  assert.ok(sphere.radius > GRID.farLimb / 2);
  assert.notEqual(caster.boundingSphere, sphere);
  assert.equal(caster.boundingSphere.radius, sphere.radius * SHADOW_CASTER.boundsPadding);
  const view: OrthographicCamera = new OrthographicCamera(-2, 2, 2, -2, 0.1, 10);
  view.position.set(GRID.farLimb, 5, 0);
  view.lookAt(GRID.farLimb, 0, 0);
  view.updateMatrixWorld(true);
  const frustum: Frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse));
  new Scene().add(caster);
  caster.updateMatrixWorld(true);
  assert.equal(caster.intersectsFrustum(frustum), true);
  caster.position.set(-GRID.farLimb * 4, 0, 0);
  caster.updateMatrixWorld(true);
  assert.equal(caster.intersectsFrustum(frustum), false);
});
