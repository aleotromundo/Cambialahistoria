import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { roadContent, roadZone, ROAD_CONTENT } from '../../test/road-support.ts';
import type { PropClimb, PropDef, ZoneDef } from '../content/types.ts';
import { buildNavGrid, isWalkable } from './grid.ts';
import type { NavGrid } from './grid.ts';
import { CLIMB, standHeight, treadHeight, zoneClimbs } from './climb.ts';
import { heightAt } from './terrain.ts';

const gallery: PropDef = must(ROAD_CONTENT.props.get('hall_gallery'), 'the gallery prop');
const climb: PropClimb = must(gallery.climb, 'the gallery climb');
const run: number = climb.steps * climb.depth;

function galleryZone(rotationDegrees: number): ZoneDef {
  return roadZone({ id: `gallery_${String(rotationDegrees)}`, cellSize: 2, tiles: ['wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww'], props: [{ prop: 'hall_gallery', x: 8, z: 8, y: 0, rotationDegrees, when: [] }] });
}

void test('each tread stands at its own rise and the top tread at the full height', (): void => {
  for (let tread: number = 0; tread < climb.steps; tread += 1) {
    const middle: number = run / 2 - (tread + 0.5) * climb.depth;
    assert.equal(treadHeight(climb, 0, middle), (tread + 1) * climb.rise);
  }
  assert.equal(treadHeight(climb, 0, -run / 2 + 0.01), climb.steps * climb.rise);
});

void test('a step up eases in just before its riser, so nothing jumps between frames', (): void => {
  let last: number = 0;
  for (let along: number = run / 2 + CLIMB.band; along >= -run / 2; along -= 0.01) {
    const height: number = must(treadHeight(climb, 0, along), 'a height on the steps');
    assert.ok(height >= last - 1e-9, `the climb never steps down going up at ${String(along)}`);
    assert.ok(height - last <= climb.rise * 0.1, `no step lifts more than a tenth of a rise in a centimetre at ${String(along)}`);
    last = height;
  }
});

void test('beside the steps or behind the top there is no climb', (): void => {
  assert.equal(treadHeight(climb, climb.width / 2 + 0.01, 0), null);
  assert.equal(treadHeight(climb, 0, run / 2 + CLIMB.band + 0.01), null);
  assert.equal(treadHeight(climb, 0, -run / 2 - 0.01), null);
});

void test('a placed gallery lifts whoever stands on it, turned with the prop', (): void => {
  const facing: ZoneDef = galleryZone(0);
  assert.equal(zoneClimbs(facing, ROAD_CONTENT.props).length, 1);
  assert.equal(standHeight(facing, ROAD_CONTENT.props, 8, 8 + run / 2 + 1), heightAt(facing, 8, 8 + run / 2 + 1));
  assert.equal(standHeight(facing, ROAD_CONTENT.props, 8, 8 - run / 2 + 0.2), climb.steps * climb.rise);
  const turned: ZoneDef = galleryZone(90);
  assert.equal(standHeight(turned, ROAD_CONTENT.props, 8 - run / 2 + 0.2, 8), climb.steps * climb.rise);
  assert.equal(standHeight(turned, ROAD_CONTENT.props, 8, 8 - run / 2 + 0.2), heightAt(turned, 8, 8 - run / 2 + 0.2));
});

void test('the treads are walkable and the back wall is not', (): void => {
  const zone: ZoneDef = galleryZone(0);
  const grid: NavGrid = buildNavGrid(zone, ROAD_CONTENT.props, roadContent(zone).surfaces, ROAD_CONTENT.player.radius);
  assert.ok(isWalkable(grid, 8, 8));
  assert.ok(isWalkable(grid, 8, 8 - run / 2 + climb.depth * 0.8));
  assert.ok(!isWalkable(grid, 8, 8 - run / 2 - 0.3));
});
