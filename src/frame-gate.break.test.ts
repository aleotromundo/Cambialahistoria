import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stoppedAtBreak } from './frame-gate.ts';
import type { BreakState } from './frame-gate.ts';

const PLAYING: BreakState = { playing: true, blocking: false, lost: false, menuOpen: false, covered: false };

void test('the pause menu, a change of area, the lobby and leaving play are breaks', (): void => {
  assert.equal(stoppedAtBreak({ ...PLAYING, menuOpen: true }), true);
  assert.equal(stoppedAtBreak({ ...PLAYING, blocking: true }), true);
  assert.equal(stoppedAtBreak({ ...PLAYING, covered: true }), true);
  assert.equal(stoppedAtBreak({ ...PLAYING, playing: false }), true);
});

void test('a stop with no break of its own, such as a page or platform pause, is not a break', (): void => {
  assert.equal(stoppedAtBreak(PLAYING), false);
});

void test('a lost touch or another tab taking over is never a break', (): void => {
  assert.equal(stoppedAtBreak({ ...PLAYING, lost: true, menuOpen: true }), false);
  assert.equal(stoppedAtBreak({ ...PLAYING, lost: true, blocking: true }), false);
});
