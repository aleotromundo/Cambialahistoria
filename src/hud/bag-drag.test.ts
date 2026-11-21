import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BAG_DRAG, outside, pulledFar } from './bag-drag.ts';

const PANEL = { left: 100, top: 50, right: 400, bottom: 450 } as const;

void test('a press only turns into a drag once the pointer moves past the slop', (): void => {
  assert.equal(pulledFar(10, 10, 10 + BAG_DRAG.slop, 10), false);
  assert.equal(pulledFar(10, 10, 10 + BAG_DRAG.slop + 1, 10), true);
  assert.equal(pulledFar(10, 10, 15, 15), true);
});

void test('letting go anywhere past the panel edge drops, inside it does not', (): void => {
  assert.equal(outside(PANEL, 250, 250), false);
  assert.equal(outside(PANEL, 100, 50), false);
  assert.equal(outside(PANEL, 99, 250), true);
  assert.equal(outside(PANEL, 250, 451), true);
  assert.equal(outside(PANEL, 401, 49), true);
});
