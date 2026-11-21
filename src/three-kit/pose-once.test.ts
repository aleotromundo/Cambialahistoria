import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Bone, BufferGeometry, Float32BufferAttribute, Group, MeshStandardMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute } from 'three';
import { threeSource } from '../../test/three-source-support.ts';
import { nextPoseTick, poseOncePerTick } from './pose-once.ts';

function skinnedRig(): { readonly root: Group; readonly mesh: SkinnedMesh; readonly bone: Bone } {
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 4, 0], 3));
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  const bone: Bone = new Bone();
  const mesh: SkinnedMesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
  const root: Group = new Group();
  root.add(bone, mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new Skeleton([bone]));
  return { root, mesh, bone };
}

void test('a rig held to one pose a tick computes its bone matrices once however often a frame asks, and again on the next tick', (): void => {
  const { root, mesh, bone } = skinnedRig();
  assert.equal(poseOncePerTick(root), 1);
  assert.equal(poseOncePerTick(root), 0);
  const shiftOf = (): number => mesh.skeleton.boneMatrices?.[12] ?? Number.NaN;
  nextPoseTick();
  bone.position.x = 3;
  root.updateMatrixWorld(true);
  mesh.skeleton.update();
  assert.equal(shiftOf(), 3);
  bone.position.x = 5;
  root.updateMatrixWorld(true);
  mesh.skeleton.update();
  assert.equal(shiftOf(), 3);
  nextPoseTick();
  mesh.skeleton.update();
  assert.equal(shiftOf(), 5);
});

void test('three still poses a skeleton once per render call, not once per game frame, which is what a pose tick narrows', (): void => {
  const objects: string = threeSource('renderers', 'webgl', 'WebGLObjects.js');
  assert.ok(objects.includes('const frame = info.render.frame;'), 'WebGLObjects no longer keys its updates by the render call count');
  assert.ok(objects.includes('if ( updateMap.get( skeleton ) !== frame ) {\n\n\t\t\t\tskeleton.update();'), 'WebGLObjects no longer poses each skeleton through its own update method once per render call');
});
