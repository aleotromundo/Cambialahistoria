import assert from 'node:assert/strict';
import test from 'node:test';
import type { Vec2 } from '../sim/math.ts';
import { TOUCH } from './mobile/touch-map.ts';
import type { MoveKeys } from './move-keys.ts';
import { createKeyWalk, keysDirection, keysReading } from './move-keys.ts';

const NONE: MoveKeys = { up: false, down: false, left: false, right: false };
const HERE: Vec2 = { x: 4, z: -2 };
const CLOSE: number = 1e-9;

function near(actual: Vec2 | null, expected: Vec2): void {
  assert.ok(actual !== null && Math.abs(actual.x - expected.x) < CLOSE && Math.abs(actual.z - expected.z) < CLOSE, `${JSON.stringify(actual)} is not ${JSON.stringify(expected)}`);
}

void test('each key points along its side of the screen and a diagonal is no faster', (): void => {
  near(keysDirection({ ...NONE, up: true }, 0), { x: 0, z: -1 });
  near(keysDirection({ ...NONE, down: true }, 0), { x: 0, z: 1 });
  near(keysDirection({ ...NONE, left: true }, 0), { x: -1, z: 0 });
  near(keysDirection({ ...NONE, right: true }, 0), { x: 1, z: 0 });
  near(keysDirection({ ...NONE, up: true, right: true }, 0), { x: Math.SQRT1_2, z: -Math.SQRT1_2 });
  assert.equal(keysReading({ ...NONE, up: true, right: true }).magnitude, 1);
});

void test('the direction turns with the camera', (): void => {
  near(keysDirection({ ...NONE, up: true }, Math.PI / 4), { x: -Math.SQRT1_2, z: -Math.SQRT1_2 });
  near(keysDirection({ ...NONE, right: true }, Math.PI / 4), { x: Math.SQRT1_2, z: -Math.SQRT1_2 });
});

void test('no key, or two keys that oppose each other, point nowhere', (): void => {
  assert.equal(keysDirection(NONE, 0), null);
  assert.equal(keysDirection({ ...NONE, up: true, down: true }, 0), null);
  assert.equal(keysDirection({ up: true, down: true, left: true, right: true }, 0), null);
  near(keysDirection({ ...NONE, up: true, down: true, left: true }, 0), { x: -1, z: 0 });
});

void test('held keys walk every step, a release stops once, and idle keys send nothing', (): void => {
  const walk = createKeyWalk(0);
  assert.deepEqual(walk.step(NONE, HERE), []);
  assert.deepEqual(walk.step({ ...NONE, right: true }, HERE), [{ type: 'walk', held: false, dest: { x: HERE.x + TOUCH.stickReach, z: HERE.z } }]);
  assert.deepEqual(walk.step({ ...NONE, right: true }, HERE), [{ type: 'walk', held: true, dest: { x: HERE.x + TOUCH.stickReach, z: HERE.z } }]);
  assert.deepEqual(walk.step(NONE, HERE), [{ type: 'stop' }]);
  assert.deepEqual(walk.step(NONE, HERE), []);
  assert.deepEqual(walk.step({ ...NONE, left: true, right: true }, HERE), []);
  assert.equal(walk.step({ ...NONE, up: true }, HERE)[0]?.type, 'walk');
});
