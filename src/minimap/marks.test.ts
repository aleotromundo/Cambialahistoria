import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LabelSize, LabelSpot, MarkOptions } from './marks.ts';
import { labelSpot, placeShown } from './marks.ts';

const CORNER: MarkOptions = { width: 200, height: 160, unit: 1, edgeArrows: true, labels: false };
const PHONE_MAP: MarkOptions = { ...CORNER, edgeArrows: false, labels: true };

void test('a labelled place counts as in view only when its whole marker is on the canvas, so one at the edge gets an arrow instead of a clipped label', (): void => {
  assert.equal(placeShown({ x: -4, y: 80 }, CORNER, 8), true);
  assert.equal(placeShown({ x: -4, y: 80 }, PHONE_MAP, 8), false);
  assert.equal(placeShown({ x: 196, y: 80 }, PHONE_MAP, 8), false);
  assert.equal(placeShown({ x: 100, y: 155 }, PHONE_MAP, 8), false);
  assert.equal(placeShown({ x: 100, y: 80 }, PHONE_MAP, 8), true);
});

void test('a place label slides and flips to stay whole on the canvas while its marker stays where the place is', (): void => {
  const size: LabelSize = { width: 120, height: 12, offset: 6 };
  const middle: LabelSpot = labelSpot({ x: 100, y: 60 }, size, 'below', PHONE_MAP);
  assert.deepEqual(middle, { x: 100, y: 66, side: 'below' });
  const nearLeft: LabelSpot = labelSpot({ x: 20, y: 60 }, size, 'below', PHONE_MAP);
  assert.equal(nearLeft.x - size.width / 2, 0);
  const nearRight: LabelSpot = labelSpot({ x: 190, y: 60 }, size, 'below', PHONE_MAP);
  assert.equal(nearRight.x + size.width / 2, PHONE_MAP.width);
  assert.deepEqual(labelSpot({ x: 100, y: 150 }, size, 'below', PHONE_MAP), { x: 100, y: 144, side: 'above' });
  assert.deepEqual(labelSpot({ x: 100, y: 10 }, size, 'above', PHONE_MAP), { x: 100, y: 16, side: 'below' });
  assert.equal(labelSpot({ x: 100, y: 60 }, { ...size, width: 400 }, 'below', PHONE_MAP).x, PHONE_MAP.width / 2);
});
