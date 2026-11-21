import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnimationClip, AnimationMixer, Bone, Group, Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three';
import { threeSource } from '../../test/three-source-support.ts';
import { quietBones } from './quiet-bones.ts';

const SKIN_TOLERANCE = 1e-6;

function swungArm(quiet: boolean): { readonly shoulder: Bone; readonly hand: Bone; readonly mixer: AnimationMixer } {
  const shoulder: Bone = new Bone();
  shoulder.name = 'shoulder';
  const hand: Bone = new Bone();
  hand.name = 'hand';
  hand.position.set(0, 1, 0);
  shoulder.add(hand);
  const body: Group = new Group();
  body.add(shoulder);
  if (quiet) assert.equal(quietBones(body), 2);
  const turned: Quaternion = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
  const swing: AnimationClip = new AnimationClip('swing', 1, [new QuaternionKeyframeTrack('shoulder.quaternion', [0, 1], [0, 0, 0, 1, turned.x, turned.y, turned.z, turned.w])]);
  const mixer: AnimationMixer = new AnimationMixer(body);
  mixer.clipAction(swing).play();
  return { shoulder, hand, mixer };
}

void test('quiet bones pose exactly as before but no longer rebuild their Euler angles on every animated frame', (): void => {
  const plain = swungArm(false);
  const quiet = swungArm(true);
  for (let frame: number = 0; frame < 30; frame += 1) {
    plain.mixer.update(1 / 60);
    quiet.mixer.update(1 / 60);
  }
  plain.shoulder.updateMatrixWorld(true);
  quiet.shoulder.updateMatrixWorld(true);
  assert.ok(quiet.hand.getWorldPosition(new Vector3()).distanceTo(plain.hand.getWorldPosition(new Vector3())) < SKIN_TOLERANCE);
  assert.ok(Math.abs(plain.shoulder.rotation.z) > 0.5);
  assert.equal(quiet.shoulder.rotation.z, 0);
});

void test('setting a quiet bone by its Euler angles still turns it', (): void => {
  const bone: Bone = new Bone();
  quietBones(bone);
  bone.rotation.set(0, Math.PI / 2, 0);
  assert.ok(Math.abs(bone.quaternion.y - Math.SQRT1_2) < SKIN_TOLERANCE);
});

void test('three still rebuilds the Euler angles from the quaternion through the rotation, which is what a quiet bone skips', (): void => {
  const object: string = threeSource('core', 'Object3D.js');
  assert.ok(object.includes('function onQuaternionChange() {\n\n\t\t\trotation.setFromQuaternion( quaternion, undefined, false );'), 'Object3D no longer rebuilds its rotation from its quaternion in onQuaternionChange');
  assert.ok(object.includes('quaternion._onChange( onQuaternionChange );'), 'Object3D no longer listens to its own quaternion');
});
