import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Bone, BufferGeometry, Float32BufferAttribute, Group, MeshStandardMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3 } from 'three';
import type { Object3D, Sphere } from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { boundSkins, disposeSkeletons, shareSkeletons } from './skeletons.ts';
import { skinnedMeshes } from './wearables.ts';

const SKIN_TOLERANCE = 1e-6;

void test('a dropped rig frees the bone texture of every skeleton under it, once each', (): void => {
  const bone: Bone = new Bone();
  const skeleton: Skeleton = new Skeleton([bone]);
  skeleton.computeBoneTexture();
  const body: SkinnedMesh = new SkinnedMesh(new BufferGeometry(), new MeshStandardMaterial());
  const worn: SkinnedMesh = new SkinnedMesh(new BufferGeometry(), new MeshStandardMaterial());
  body.add(bone);
  body.bind(skeleton);
  worn.bind(skeleton);
  const root: Group = new Group();
  root.add(body, worn);
  let freed: number = 0;
  skeleton.boneTexture?.addEventListener('dispose', (): void => {
    freed += 1;
  });
  assert.equal(disposeSkeletons(root), 1);
  assert.equal(freed, 1);
  assert.equal(skeleton.boneTexture, null);
});

function skinnedTemplate(): Group {
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
  return root;
}

function firstSkin(root: Object3D): SkinnedMesh {
  const [found] = skinnedMeshes(root);
  if (found === undefined) throw new Error('no skinned mesh');
  return found;
}

void test('a rig template is bounded once, and every rig cloned from it carries the bounds without skinning its vertices again', (): void => {
  const template: Group = skinnedTemplate();
  assert.equal(boundSkins(template), 1);
  const sphere: Sphere = firstSkin(template).boundingSphere;
  for (const corner of [new Vector3(0, 0, 0), new Vector3(2, 0, 0), new Vector3(0, 4, 0)]) assert.ok(sphere.distanceToPoint(corner) < SKIN_TOLERANCE, `${corner.x},${corner.y}`);
  assert.equal(boundSkins(template), 0);
  const copy: SkinnedMesh = firstSkin(cloneSkinned(template));
  assert.equal(copy.boundingSphere.radius, sphere.radius);
  assert.notEqual(copy.boundingSphere, sphere);
});

function threeVertexGeometry(): BufferGeometry {
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 1, 0, 1, 2, 0, 0, 3, 1], 3));
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute([0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0], 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute([0.5, 0.5, 0, 0, 1, 0, 0, 0, 0.25, 0.75, 0, 0], 4));
  return geometry;
}

interface HeadRig {
  readonly root: Group;
  readonly head: SkinnedMesh;
  readonly eyes: SkinnedMesh;
  readonly neck: Bone;
}

function headRig(eyesOffset: number): HeadRig {
  const hip: Bone = new Bone();
  const neck: Bone = new Bone();
  neck.position.set(0, 2, 0);
  hip.add(neck);
  const head: SkinnedMesh = new SkinnedMesh(threeVertexGeometry(), new MeshStandardMaterial());
  const eyes: SkinnedMesh = new SkinnedMesh(threeVertexGeometry(), new MeshStandardMaterial());
  const root: Group = new Group();
  root.add(hip, head, eyes);
  root.updateMatrixWorld(true);
  head.bind(new Skeleton([hip, neck]));
  neck.position.y += eyesOffset;
  root.updateMatrixWorld(true);
  eyes.bind(new Skeleton([hip, neck]));
  neck.position.y -= eyesOffset;
  root.updateMatrixWorld(true);
  return { root, head, eyes, neck };
}

function skinnedVertices(mesh: SkinnedMesh): number[] {
  const out: number[] = [];
  for (let index: number = 0; index < 3; index += 1) {
    const at: Vector3 = new Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'), index);
    mesh.applyBoneTransform(index, at);
    out.push(at.x, at.y, at.z);
  }
  return out;
}

void test('meshes skinned to the same bones with the same inverse bind matrices share one skeleton, so one bone texture is updated', (): void => {
  const rig: HeadRig = headRig(0);
  assert.notEqual(rig.head.skeleton, rig.eyes.skeleton);
  rig.neck.rotation.z = 0.7;
  rig.root.updateMatrixWorld(true);
  rig.head.skeleton.update();
  rig.eyes.skeleton.update();
  const before: number[] = skinnedVertices(rig.eyes);
  assert.equal(shareSkeletons(rig.root), 1);
  assert.equal(rig.head.skeleton, rig.eyes.skeleton);
  rig.eyes.skeleton.update();
  assert.deepEqual(skinnedVertices(rig.eyes), before);
  assert.equal(shareSkeletons(rig.root), 0);
});

void test('a mesh bound in another pose keeps its own skeleton', (): void => {
  const rig: HeadRig = headRig(0.5);
  assert.equal(shareSkeletons(rig.root), 0);
  assert.notEqual(rig.head.skeleton, rig.eyes.skeleton);
});

void test('a cloned rig shares its skeletons again, since each clone gives every mesh its own', (): void => {
  const copy: Object3D = cloneSkinned(headRig(0).root);
  const skeletons: Set<Skeleton> = new Set<Skeleton>(skinnedMeshes(copy).map((mesh: SkinnedMesh): Skeleton => mesh.skeleton));
  assert.equal(skeletons.size, 2);
  assert.equal(shareSkeletons(copy), 1);
  assert.equal(new Set<Skeleton>(skinnedMeshes(copy).map((mesh: SkinnedMesh): Skeleton => mesh.skeleton)).size, 1);
});
