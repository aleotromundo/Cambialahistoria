import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DuelFraming, DuelShot, FrameKeep, FrameView, GroundHeight, GroundSpot, ScreenBox } from './duel-frame.ts';
import { createDuelFraming, DUEL_FRAME, duelShot, stepDuelFraming } from './duel-frame.ts';

const VIEW: FrameView = { aspect: 16 / 9, fovDegrees: 30, yawDegrees: 45, pitchDegrees: 50, lookHeight: 1.1, topCover: 0.3 };
const TALL: FrameView = { ...VIEW, aspect: 9 / 19.5 };
const FLAT: GroundHeight = (): number => 0;
const OPEN: FrameKeep = { covers: [] };
const BAR: ScreenBox = { left: -0.5, right: 0.5, bottom: -1, top: -0.7 };
const MAP: ScreenBox = { left: 0.6, right: 1, bottom: 0.4, top: 1 };
const HUD: FrameKeep = { covers: [BAR, MAP] };
const SLACK: number = 1e-6;
const RUN_SPEED: number = 7.6;
const ONSET_FRAMES: number = 60;
const ONSET_GIVE: number = 1;

interface Screen {
  readonly x: number;
  readonly y: number;
}

function onScreen(shot: DuelShot, view: FrameView, x: number, y: number, z: number): Screen {
  const yaw: number = (view.yawDegrees * Math.PI) / 180;
  const pitch: number = (view.pitchDegrees * Math.PI) / 180;
  const dx: number = x - shot.x;
  const dy: number = y - view.lookHeight;
  const dz: number = z - shot.z;
  const across: number = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const upward: number = -dx * Math.sin(pitch) * Math.sin(yaw) + dy * Math.cos(pitch) - dz * Math.sin(pitch) * Math.cos(yaw);
  const depth: number = shot.distance - dx * Math.sin(yaw) * Math.cos(pitch) - dy * Math.sin(pitch) - dz * Math.cos(yaw) * Math.cos(pitch);
  const tanHigh: number = Math.tan((view.fovDegrees * Math.PI) / 360);
  return { x: across / (depth * tanHigh * view.aspect), y: upward / (depth * tanHigh) };
}

function ring(spot: GroundSpot, radius: number): GroundSpot[] {
  const points: GroundSpot[] = [];
  for (let step: number = 0; step < 32; step += 1) {
    const turn: number = (step / 32) * Math.PI * 2;
    points.push({ x: spot.x + Math.cos(turn) * radius, z: spot.z + Math.sin(turn) * radius });
  }
  return points;
}

function under(box: ScreenBox, seen: Screen): boolean {
  return seen.x > box.left + SLACK && seen.x < box.right - SLACK && seen.y > box.bottom + SLACK && seen.y < box.top - SLACK;
}

function clickable(shot: DuelShot, view: FrameView, keep: FrameKeep, spot: GroundSpot): boolean {
  const seen: Screen = onScreen(shot, view, spot.x, 0, spot.z);
  if (Math.abs(seen.x) > 1 + SLACK || Math.abs(seen.y) > 1 + SLACK) return false;
  if (seen.y > 1 - view.topCover + SLACK) return false;
  return !keep.covers.some((box: ScreenBox): boolean => under(box, seen));
}

function roomAround(shot: DuelShot, view: FrameView, keep: FrameKeep, hero: GroundSpot): boolean {
  return ring(hero, DUEL_FRAME.keepMargin).every((spot: GroundSpot): boolean => clickable(shot, view, keep, spot));
}

const SPREADS: readonly (readonly [GroundSpot, GroundSpot])[] = [
  [{ x: 9, z: 9 }, { x: -9, z: -9 }],
  [{ x: -9, z: -9 }, { x: 9, z: 9 }],
  [{ x: 10, z: -10 }, { x: -10, z: 10 }],
  [{ x: -10, z: 10 }, { x: 10, z: -10 }],
  [{ x: 14, z: 0 }, { x: -14, z: 0 }],
  [{ x: 0, z: 14 }, { x: 0, z: -14 }],
  [{ x: 3, z: 3 }, { x: 1, z: 1 }],
];

void test('the player keeps a margin of clickable ground on every side, clear of the HUD, wherever the rival stands', (): void => {
  for (const view of [VIEW, TALL]) {
    for (const keep of [OPEN, HUD]) {
      for (const [hero, rival] of SPREADS) {
        const shot: DuelShot = duelShot(hero, rival, view, FLAT, keep);
        assert.ok(roomAround(shot, view, keep, hero), JSON.stringify({ hero, rival, view: view.aspect, covers: keep.covers.length, shot }));
      }
    }
  }
});

function buttonColumn(): ScreenBox[] {
  const buttons: ScreenBox[] = [];
  for (let row: number = 0; row < 6; row += 1) buttons.push({ left: 0.76, right: 0.9, bottom: 0.4 - row * 0.2, top: 0.48 - row * 0.2 });
  return buttons;
}

function discClickable(shot: DuelShot, view: FrameView, keep: FrameKeep, hero: GroundSpot): boolean {
  for (let radius: number = 0.25; radius <= DUEL_FRAME.keepMargin; radius += 0.25) {
    if (!ring(hero, radius).every((spot: GroundSpot): boolean => clickable(shot, view, keep, spot))) return false;
  }
  return true;
}

void test('small buttons with gaps between them never sit inside the margin, between the points the framing looks at', (): void => {
  const keep: FrameKeep = { covers: buttonColumn() };
  for (const view of [TALL, VIEW]) {
    for (const [hero, rival] of SPREADS) {
      const shot: DuelShot = duelShot(hero, rival, view, FLAT, keep);
      assert.ok(discClickable(shot, view, keep, hero), JSON.stringify({ hero, rival, view: view.aspect, shot }));
    }
  }
});

void test('a hero standing low on screen, over the bar, is what the old framing let fall under the HUD', (): void => {
  const hero: GroundSpot = { x: 9, z: 9 };
  const rival: GroundSpot = { x: -9, z: -9 };
  assert.ok(!roomAround(duelShot(hero, rival, VIEW, FLAT), VIEW, HUD, hero));
  assert.ok(roomAround(duelShot(hero, rival, VIEW, FLAT, HUD), VIEW, HUD, hero));
});

void test('while both heroes fit, the camera still aims between them', (): void => {
  const shot: DuelShot = duelShot({ x: 6, z: 2 }, { x: -2, z: -4 }, VIEW, FLAT, HUD);
  assert.equal(shot.x, 2);
  assert.equal(shot.z, -1);
  assert.ok(shot.distance < DUEL_FRAME.farthest);
});

void test('when both cannot fit, the camera slides toward the player and lets the rival go off the frame', (): void => {
  const hero: GroundSpot = { x: 40, z: 40 };
  const rival: GroundSpot = { x: -40, z: -40 };
  const shot: DuelShot = duelShot(hero, rival, VIEW, FLAT, HUD);
  assert.equal(shot.distance, DUEL_FRAME.farthest);
  assert.ok(shot.x > 0 && shot.z > 0);
  assert.ok(shot.x < hero.x && shot.z < hero.z);
  assert.ok(roomAround(shot, VIEW, HUD, hero));
  assert.ok(!clickable(shot, VIEW, OPEN, rival));
  const nearer: DuelShot = duelShot({ x: 30, z: 30 }, rival, VIEW, FLAT, HUD);
  assert.ok(nearer.x < shot.x);
});

void test('the margin never asks the camera past its farthest, even with a cover over the middle of the screen', (): void => {
  const wall: FrameKeep = { covers: [{ left: -1, right: 1, bottom: -1, top: 1 }] };
  const shot: DuelShot = duelShot({ x: 4, z: 4 }, { x: -4, z: -4 }, VIEW, FLAT, wall);
  assert.equal(shot.distance, DUEL_FRAME.farthest);
  assert.ok(Number.isFinite(shot.x) && Number.isFinite(shot.z));
});

void test('while the player runs toward the edge of the screen, the camera keeps the margin clickable on every frame, giving at most a metre in the first second of a run', (): void => {
  const runs: readonly (readonly [FrameView, FrameKeep, number, number])[] = [
    [VIEW, HUD, 1, 1],
    [VIEW, HUD, 1, -1],
    [TALL, { covers: buttonColumn() }, 1, -1],
    [TALL, { covers: buttonColumn() }, -1, 1],
  ];
  for (const [view, keep, alongX, alongZ] of runs) {
    const framing: DuelFraming = createDuelFraming();
    const rival: GroundSpot = { x: -6 * alongX, z: -6 * alongZ };
    const step: number = (RUN_SPEED / 60) / Math.SQRT2;
    for (let frame: number = 0; frame < 240; frame += 1) {
      const hero: GroundSpot = { x: frame * step * alongX, z: frame * step * alongZ };
      const shot: DuelShot = stepDuelFraming(framing, hero, rival, view, FLAT, 1 / 60, keep);
      if (shot.distance >= DUEL_FRAME.farthest - SLACK) continue;
      const kept: number = frame < ONSET_FRAMES ? DUEL_FRAME.keepMargin - ONSET_GIVE : DUEL_FRAME.keepMargin;
      assert.ok(ring(hero, kept).every((spot: GroundSpot): boolean => clickable(shot, view, keep, spot)), JSON.stringify({ frame, hero, view: view.aspect, shot }));
    }
  }
});

void test('reframing for the margin eases from frame to frame as the player runs to the bottom of the screen and back', (): void => {
  const framing: DuelFraming = createDuelFraming();
  const rival: GroundSpot = { x: -12, z: -12 };
  let last: DuelShot = stepDuelFraming(framing, { x: 0, z: 0 }, rival, VIEW, FLAT, 1 / 60, HUD);
  let moved: DuelShot = { x: 0, z: 0, distance: 0 };
  for (let frame: number = 1; frame < 720; frame += 1) {
    const reach: number = frame < 360 ? frame / 12 : (720 - frame) / 12;
    const shot: DuelShot = stepDuelFraming(framing, { x: reach, z: reach }, rival, VIEW, FLAT, 1 / 60, HUD);
    const step: DuelShot = { x: shot.x - last.x, z: shot.z - last.z, distance: shot.distance - last.distance };
    assert.ok(Math.abs(step.x) < 0.2 && Math.abs(step.z) < 0.2 && Math.abs(step.distance) < 1, JSON.stringify({ frame, step }));
    if (frame > 1) assert.ok(Math.abs(step.x - moved.x) < 0.05 && Math.abs(step.z - moved.z) < 0.05 && Math.abs(step.distance - moved.distance) < 0.1, JSON.stringify({ frame, step, moved }));
    moved = step;
    last = shot;
  }
});
