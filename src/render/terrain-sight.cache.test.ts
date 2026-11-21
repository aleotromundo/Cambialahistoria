import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, ZoneDef } from '../../sim/content/types.ts';
import type { TerrainSight } from './terrain-sight.ts';
import { keepZones } from '../../sim/zone-cache.ts';
import { createTerrainSight } from './terrain-sight.ts';

const content: Content = loadContent();

function caves(): ZoneDef {
  const zone: ZoneDef | undefined = content.zones.get('under_hall');
  assert.ok(zone !== undefined);
  return zone;
}

void test('a terrain sight is reused while its zone is kept and sampled again once it has been let go', (): void => {
  const zone: ZoneDef = caves();
  const first: TerrainSight | null = createTerrainSight(zone);
  assert.ok(first !== null);
  keepZones(zone, new Set<ZoneDef>());
  assert.equal(createTerrainSight(zone), first);
  keepZones(null, new Set<ZoneDef>());
  const again: TerrainSight | null = createTerrainSight(zone);
  assert.ok(again !== null);
  assert.notEqual(again, first);
});
