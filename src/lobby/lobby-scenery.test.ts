import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PointLight } from 'three';
import { Vector3 } from 'three';
import { must } from '../../test/support.ts';
import { groundHeight } from './lobby-ground.ts';
import { featherShare, lampFlicker, lampLights, LOBBY_SCENERY, pieceMatrix, pieceSeat, stepFlash, strikeShape, swayAngle } from './lobby-scenery.ts';
import type { FlashState } from './lobby-scenery.ts';
import { LOBBY_SETS, setMounds } from './lobby-sets.ts';
import type { Flash, Lamp, LobbySet, SetPiece } from './lobby-sets.ts';

const STONES: LobbySet = must(LOBBY_SETS.sets.get('stones'), 'the stones set');

void test('the rocks of the first lobby stand where they always stood, bedded a fifth of their size into their own rise', (): void => {
  const mounds = setMounds(STONES);
  assert.equal(mounds.length, STONES.pieces.length);
  for (const piece of STONES.pieces) {
    assert.ok(Math.abs(pieceSeat(piece, mounds) - (groundHeight(piece.x, piece.z, mounds) - 0.2 * piece.size)) < 1e-9, piece.prop);
    assert.equal(STONES.stone, 'black_rock');
  }
});

void test('a piece is placed on the ground under it, turned, tilted and sized from its data', (): void => {
  const piece: SetPiece = { prop: 'castle_column', x: 4, z: -12, y: 0.5, yawDegrees: 90, pitchDegrees: 0, rollDegrees: 0, size: 2, sink: 0.1, mound: false, swayDegrees: 0, skirt: true };
  const matrix = pieceMatrix(piece, 1.5, [], 0);
  const origin: Vector3 = new Vector3().setFromMatrixPosition(matrix);
  assert.ok(Math.abs(origin.y - (groundHeight(4, -12, []) - 0.1 + 0.5)) < 1e-9);
  assert.ok(Math.abs(new Vector3().setFromMatrixScale(matrix).x - 3) < 1e-9);
  const across: Vector3 = new Vector3(1, 0, 0).transformDirection(matrix);
  assert.ok(Math.abs(across.z + 1) < 1e-9, 'a quarter turn sends the model\'s width away from the camera');
  const hanging: Vector3 = new Vector3(0, 1, 0).transformDirection(pieceMatrix({ ...piece, pitchDegrees: 180 }, 1, [], 0));
  assert.ok(hanging.y < -0.999, 'a piece turned over hangs down');
});

void test('a banner sways a few degrees and comes back, and a still piece never moves', (): void => {
  const banner: SetPiece = { prop: 'banner_blue', x: 0, z: -12, y: 0, yawDegrees: 0, pitchDegrees: 0, rollDegrees: 0, size: 1, sink: 0, mound: false, swayDegrees: 3, skirt: false };
  const angles: number[] = Array.from({ length: 200 }, (_: unknown, step: number): number => swayAngle(banner, step * 0.05, 0));
  assert.ok(Math.max(...angles) <= (3 * Math.PI) / 180 + 1e-9 && Math.min(...angles) < 0 && Math.max(...angles) > 0);
  assert.equal(swayAngle({ ...banner, swayDegrees: 0 }, 3.3, 2), 0);
});

void test('far lightning strikes now and then, rises in a blink, fades, and flickers once more before it is gone', (): void => {
  assert.equal(strikeShape(-1), 0);
  assert.ok(strikeShape(LOBBY_SCENERY.flash.rise) > 0.99);
  assert.ok(strikeShape(LOBBY_SCENERY.flash.echoAfter + LOBBY_SCENERY.flash.rise) > strikeShape(LOBBY_SCENERY.flash.echoAfter - 0.01));
  assert.ok(strikeShape(4) < 0.01);
  const flash: Flash = { everyMin: 5, everyMax: 9, strength: 0.8 };
  const state: FlashState = { wait: 1, since: Number.POSITIVE_INFINITY };
  const amounts: number[] = [];
  for (let step: number = 0; step < 1200; step += 1) amounts.push(stepFlash(state, flash, 1 / 60, (): number => 0.5));
  assert.equal(amounts[0], 0);
  assert.ok(Math.max(...amounts) <= flash.strength && Math.max(...amounts) > flash.strength * 0.9);
  const strikes: number = amounts.filter((amount: number, index: number): boolean => index > 0 && amount > 0.5 && (amounts[index - 1] ?? 0) <= 0.5).length;
  assert.ok(strikes >= 3 && strikes <= 6, `${strikes} rises in 20 seconds`);
});

void test('a lamp glow is soft all the way out and has no edge', (): void => {
  assert.equal(featherShare(0), 1);
  assert.equal(featherShare(1), 0);
  assert.equal(featherShare(1.3), 0);
  assert.ok(featherShare(0.98) < 0.002);
});

void test('a lamp starts dark where its data puts it, and a flickering fire wavers round its strength without going out while a steady lantern holds still', (): void => {
  const lamps: readonly Lamp[] = [
    { x: 3, y: 0.8, z: -12, color: '#ff8a3a', intensity: 12, distance: 7, flicker: 0.3 },
    { x: -2, y: 3, z: 14, color: '#ffc874', intensity: 8, distance: 8, flicker: 0 },
  ];
  const lights: readonly PointLight[] = lampLights(lamps);
  assert.equal(lights.length, 2);
  assert.deepEqual(lights.map((light: PointLight): readonly number[] => [light.position.x, light.position.y, light.position.z, light.intensity, light.distance, light.decay]), [[3, 0.8, -12, 0, 7, LOBBY_SCENERY.lamp.decay], [-2, 3, 14, 0, 8, LOBBY_SCENERY.lamp.decay]]);
  const fire: readonly number[] = Array.from({ length: 200 }, (_unused: unknown, step: number): number => lampFlicker(step * 0.05, 0, 0.3));
  assert.ok(Math.min(...fire) >= 0.7 - 1e-9 && Math.max(...fire) <= 1.3 + 1e-9);
  assert.ok(Math.max(...fire) - Math.min(...fire) > 0.2);
  for (let step: number = 0; step < 50; step += 1) assert.equal(lampFlicker(step * 0.1, 1, 0), 1);
});
