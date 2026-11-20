import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DuelFraming, DuelShot, FrameView, Glide, GroundHeight, GroundSpot } from './duel-frame.ts';
import { createDuelFraming, DUEL_FRAME, duelReach, duelShot, glideTo, stepDuelFraming } from './duel-frame.ts';

const VIEW: FrameView = { aspect: 16 / 9, fovDegrees: 30, yawDegrees: 45, pitchDegrees: 50, lookHeight: 1.1, topCover: 0 };
const COVERED: FrameView = { ...VIEW, topCover: 0.35 };
const FLAT: GroundHeight = (): number => 0;
const RAISED: GroundHeight = (): number => 3;
const SLOPE: GroundHeight = (x: number): number => Math.max(0, -x) * 0.6;
const TALL: FrameView = { ...VIEW, aspect: 9 / 16 };

interface Seen {
  readonly side: number;
  readonly top: number;
  readonly bottom: number;
}

function seenFrom(shot: DuelShot, view: FrameView, x: number, y: number, z: number): Seen {
  const yaw: number = (view.yawDegrees * Math.PI) / 180;
  const pitch: number = (view.pitchDegrees * Math.PI) / 180;
  const dx: number = x - shot.x;
  const dy: number = y - view.lookHeight;
  const dz: number = z - shot.z;
  const across: number = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const upward: number = -dx * Math.sin(pitch) * Math.sin(yaw) + dy * Math.cos(pitch) - dz * Math.sin(pitch) * Math.cos(yaw);
  const depth: number = shot.distance - dx * Math.sin(yaw) * Math.cos(pitch) - dy * Math.sin(pitch) - dz * Math.cos(yaw) * Math.cos(pitch);
  const tanHigh: number = Math.tan((view.fovDegrees * Math.PI) / 360);
  return { side: (Math.abs(across) + DUEL_FRAME.pad) / (depth * tanHigh * view.aspect), top: (upward + DUEL_FRAME.pad) / (depth * tanHigh), bottom: (DUEL_FRAME.pad - upward) / (depth * tanHigh) };
}

function inFrame(shot: DuelShot, view: FrameView, spots: readonly GroundSpot[]): boolean {
  const slack: number = 1e-9;
  return spots.every((spot: GroundSpot): boolean => [0, DUEL_FRAME.headHeight].every((height: number): boolean => {
    const seen: Seen = seenFrom(shot, view, spot.x, height, spot.z);
    return seen.side <= 1 - DUEL_FRAME.keepSide + slack && seen.top <= 1 - DUEL_FRAME.keepTop - view.topCover + slack && seen.bottom <= 1 - DUEL_FRAME.keepBottom + slack;
  }));
}

void test('the camera aims between the two heroes', (): void => {
  const shot: DuelShot = duelShot({ x: -4, z: 2 }, { x: 6, z: 10 }, VIEW, FLAT);
  assert.equal(shot.x, 1);
  assert.equal(shot.z, 6);
});

void test('heroes close together are seen at the normal play distance, never nearer', (): void => {
  assert.equal(duelShot({ x: 0, z: 0 }, { x: 1, z: 1 }, VIEW, FLAT).distance, DUEL_FRAME.nearest);
  assert.equal(duelShot({ x: 3, z: 3 }, { x: 3, z: 3 }, TALL, FLAT).distance, DUEL_FRAME.nearest);
});

void test('heroes far apart pull the camera back until both stand in frame with room to spare', (): void => {
  const spreads: readonly (readonly [FrameView, GroundSpot, GroundSpot])[] = [
    [VIEW, { x: -16, z: 0 }, { x: 16, z: 0 }],
    [VIEW, { x: 0, z: -10 }, { x: 0, z: 10 }],
    [VIEW, { x: -8, z: 8 }, { x: 8, z: -8 }],
    [VIEW, { x: 3, z: 3 }, { x: 14, z: 14 }],
    [TALL, { x: -7, z: 0 }, { x: 7, z: 0 }],
    [TALL, { x: -5, z: 5 }, { x: 5, z: -5 }],
    [TALL, { x: 0, z: -6 }, { x: 0, z: 6 }],
    [COVERED, { x: -14, z: 0 }, { x: 14, z: 0 }],
    [COVERED, { x: -6, z: -6 }, { x: 6, z: 6 }],
  ];
  for (const [view, a, b] of spreads) {
    const shot: DuelShot = duelShot(a, b, view, FLAT);
    assert.ok(shot.distance > DUEL_FRAME.nearest);
    assert.ok(shot.distance < DUEL_FRAME.farthest);
    assert.ok(inFrame(shot, view, [a, b]));
    assert.ok(!inFrame({ ...shot, distance: shot.distance - 0.5 }, view, [a, b]));
  }
});

void test('ground raised under both heroes alike changes nothing, and a hero up a slope asks for more room', (): void => {
  const a: GroundSpot = { x: -6, z: -6 };
  const b: GroundSpot = { x: 6, z: 6 };
  assert.ok(Math.abs(duelShot(a, b, VIEW, RAISED).distance - duelShot(a, b, VIEW, FLAT).distance) < 1e-9);
  assert.ok(duelShot(a, b, VIEW, SLOPE).distance > duelShot(a, b, VIEW, FLAT).distance);
});

void test('a panel over the top of the screen pulls the camera back for a hero standing high on screen', (): void => {
  const a: GroundSpot = { x: -6, z: -6 };
  const b: GroundSpot = { x: 6, z: 6 };
  assert.ok(duelShot(a, b, COVERED, FLAT).distance > duelShot(a, b, VIEW, FLAT).distance);
  assert.ok(duelShot(a, b, { ...VIEW, topCover: 5 }, FLAT).distance <= DUEL_FRAME.farthest);
});

void test('the spread only widens the view and never past the farthest the watch allows', (): void => {
  let last: number = 0;
  for (let gap: number = 0; gap <= 200; gap += 5) {
    const distance: number = duelShot({ x: -gap / 2, z: 0 }, { x: gap / 2, z: 0 }, VIEW, FLAT).distance;
    assert.ok(distance >= last);
    assert.ok(distance <= DUEL_FRAME.farthest);
    last = distance;
  }
  assert.equal(last, DUEL_FRAME.farthest);
});

void test('a lagging aim asks for more room than a centred one', (): void => {
  const a: GroundSpot = { x: -16, z: 0 };
  const b: GroundSpot = { x: 16, z: 0 };
  assert.ok(duelReach(a, b, { x: -3, z: -3 }, VIEW, FLAT) > duelReach(a, b, { x: 0, z: 0 }, VIEW, FLAT));
});

void test('a glide eases to its target without overshoot and stays there', (): void => {
  let glide: Glide = { value: 0, speed: 0 };
  let last: number = 0;
  for (let frame: number = 0; frame < 600; frame += 1) {
    glide = glideTo(glide, 10, 3, 1 / 60);
    assert.ok(glide.value >= last - 1e-12);
    assert.ok(glide.value <= 10);
    last = glide.value;
  }
  assert.deepEqual(glide, { value: 10, speed: 0 });
  assert.deepEqual(glideTo(glide, 10, 3, 0), glide);
});

void test('framing starts on the heroes and then never jumps from one frame to the next', (): void => {
  const framing: DuelFraming = createDuelFraming();
  const first: DuelShot = stepDuelFraming(framing, { x: 0, z: 0 }, { x: 2, z: 0 }, VIEW, FLAT, 1 / 60);
  assert.deepEqual(first, duelShot({ x: 0, z: 0 }, { x: 2, z: 0 }, VIEW, FLAT));
  let last: DuelShot = first;
  for (let frame: number = 1; frame < 360; frame += 1) {
    const apart: number = frame < 180 ? 2 + frame * 0.15 : 2 + (360 - frame) * 0.15;
    const shot: DuelShot = stepDuelFraming(framing, { x: 0, z: 0 }, { x: apart, z: apart * 0.5 }, VIEW, FLAT, 1 / 60);
    assert.ok(Math.abs(shot.x - last.x) < 0.2);
    assert.ok(Math.abs(shot.z - last.z) < 0.2);
    assert.ok(Math.abs(shot.distance - last.distance) < 0.5);
    assert.ok(shot.distance >= DUEL_FRAME.nearest - 1e-9);
    last = shot;
  }
});
