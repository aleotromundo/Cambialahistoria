import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, ZoneDef } from '../../sim/content/types.ts';
import { keepZones } from '../../sim/zone-cache.ts';
import { createTerrainSight, sightReady } from './terrain-sight.ts';

const content: Content = loadContent();

function zoneOf(id: string): ZoneDef {
  const zone: ZoneDef | undefined = content.zones.get(id);
  assert.ok(zone !== undefined);
  return zone;
}

void test('a cave sight counts as ready only once its zone view has built it, so input never samples the field in a frame of its own', (): void => {
  const cave: ZoneDef = zoneOf('under_hall');
  keepZones(null, new Set<ZoneDef>());
  assert.equal(sightReady(cave), false);
  createTerrainSight(cave);
  assert.equal(sightReady(cave), true);
});

void test('a zone without terrain is always ready, since it has no sight to build', (): void => {
  assert.equal(sightReady(zoneOf('hall_of_time')), true);
});
