import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, ZoneDef } from '../../sim/content/types.ts';
import type { TerrainSight } from './terrain-sight.ts';
import { createTerrainSight, keepTerrainSightOf } from './terrain-sight.ts';

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
  keepTerrainSightOf(new Set<ZoneDef>([zone]));
  assert.equal(createTerrainSight(zone), first);
  keepTerrainSightOf(new Set<ZoneDef>());
  const again: TerrainSight | null = createTerrainSight(zone);
  assert.ok(again !== null);
  assert.notEqual(again, first);
});
