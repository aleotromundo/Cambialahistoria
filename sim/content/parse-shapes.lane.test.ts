import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContentError } from './read.ts';
import type { ShapeDelivery } from './parse-shapes.ts';
import { shapeDelivery } from './parse-shapes.ts';

void test('an area may lie as a lane on the ground, but not pull or follow its caster', (): void => {
  const lane: ShapeDelivery = shapeDelivery('area', { range: 1, radius: 0.9, length: 8, duration: 3, pulse: 0.5, pull: 0, slow: 1, anchor: 'ground' }, 'x');
  assert.equal(lane.type === 'area' ? lane.length : null, 8);
  assert.throws((): unknown => shapeDelivery('area', { range: 0, radius: 0.9, length: 8, duration: 3, pulse: 0.5, pull: 0, slow: 1, anchor: 'caster' }, 'x'), ContentError);
  assert.throws((): unknown => shapeDelivery('area', { range: 1, radius: 0.9, length: 8, duration: 3, pulse: 0.5, pull: 4, slow: 1, anchor: 'ground' }, 'x'), ContentError);
});
