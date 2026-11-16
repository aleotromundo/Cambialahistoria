import assert from 'node:assert/strict';
import test from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { ZoneDef } from '../../sim/content/types.ts';
import type { TerrainCell } from '../../sim/nav/terrain.ts';
import { floorAt, rampAt, terrainCell } from '../../sim/nav/terrain.ts';
import { drawnGround } from './ground-terrain.ts';
import { liftAt } from './terrain-lift.ts';

const SWEEP = { stride: 3.1, settle: 0.001 } as const;

void test('in every raised zone the drawn floor never stands above the floor actors are drawn on, so no foot sinks into it', (): void => {
  const zones: ZoneDef[] = [...loadContent().zones.values()].filter((zone: ZoneDef): boolean => zone.terrain !== null);
  assert.ok(zones.some((zone: ZoneDef): boolean => zone.id === 'under_hall_2'));
  for (const zone of zones) {
    let checked: number = 0;
    for (let x: number = SWEEP.stride / 2; x < (zone.tiles[0]?.length ?? 0) * zone.cellSize; x += SWEEP.stride) {
      for (let z: number = SWEEP.stride / 2; z < zone.tiles.length * zone.cellSize; z += SWEEP.stride) {
        if (!floorAt(zone, x, z)) continue;
        const cell: TerrainCell = terrainCell(zone, x, z);
        const above: number = drawnGround(zone, x, z) - liftAt(zone, x, z);
        assert.ok(above <= SWEEP.settle, `${zone.id} at ${x.toFixed(1)},${z.toFixed(1)}${rampAt(zone, cell.column, cell.row) ? ' on a ramp' : ''}: the drawn floor is ${above.toFixed(3)} m above the feet`);
        checked += 1;
      }
    }
    assert.ok(checked > 0, zone.id);
  }
});
