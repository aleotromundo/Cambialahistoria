import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FRAME_GATE, frameGate } from './frame-gate.ts';
import type { FrameState } from './frame-gate.ts';

const PLAYING: FrameState = { playing: true, blocking: false, lost: false, menuOpen: false, presenting: true, covered: false, gpuQueued: 0 };

void test('the world steps while the menu is open, and the game takes no commands', (): void => {
  assert.deepEqual(frameGate({ ...PLAYING, menuOpen: true }), { collect: true, queue: false, step: true, draw: true, present: true });
});

void test('with the menu closed the world steps and takes commands', (): void => {
  assert.deepEqual(frameGate(PLAYING), { collect: true, queue: true, step: true, draw: true, present: true });
});

void test('nothing steps or collects on the lobby or when the touch input is lost', (): void => {
  assert.deepEqual(frameGate({ ...PLAYING, playing: false }), { collect: false, queue: false, step: false, draw: false, present: true });
  assert.deepEqual(frameGate({ ...PLAYING, lost: true }), { collect: false, queue: false, step: false, draw: true, present: true });
});

void test('during a zone change input is drained but nothing is queued or stepped', (): void => {
  assert.deepEqual(frameGate({ ...PLAYING, blocking: true, presenting: false }), { collect: true, queue: false, step: false, draw: false, present: false });
});

void test('the scene is not drawn behind the title or the lobby, nor while the veil fades in or the zone builds, and is drawn under the veil while the new zone settles', (): void => {
  assert.equal(frameGate({ ...PLAYING, playing: false }).draw, false);
  assert.equal(frameGate({ ...PLAYING, blocking: true, presenting: false }).draw, false);
  assert.equal(frameGate({ ...PLAYING, blocking: true, presenting: true }).draw, true);
  assert.equal(frameGate({ ...PLAYING, menuOpen: true }).draw, true);
});

void test('under the veil a new frame is drawn only while the GPU has fewer than a few frames still to finish, and in view always', (): void => {
  assert.equal(frameGate({ ...PLAYING, blocking: true, gpuQueued: FRAME_GATE.queuedUnderVeil - 1 }).draw, true);
  assert.equal(frameGate({ ...PLAYING, blocking: true, gpuQueued: FRAME_GATE.queuedUnderVeil }).draw, false);
  assert.equal(frameGate({ ...PLAYING, gpuQueued: FRAME_GATE.queuedUnderVeil * 4 }).draw, true);
});

void test('the play world is neither presented nor drawn while the lobby covers it, and is again once the lobby is gone', (): void => {
  const covered: FrameState = { ...PLAYING, playing: false, covered: true };
  assert.equal(frameGate(covered).present, false);
  assert.equal(frameGate(covered).draw, false);
  assert.equal(frameGate({ ...covered, covered: false }).present, true);
  assert.equal(frameGate({ ...PLAYING, covered: false }).present, true);
});
