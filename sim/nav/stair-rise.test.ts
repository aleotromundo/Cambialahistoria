import assert from 'node:assert/strict';
import { test } from 'node:test';
import hourfall from '../../data/kits/hourfall.json' with { type: 'json' };
import lava from '../../data/kits/lava.json' with { type: 'json' };
import ledgerHall from '../../data/kits/ledger_hall.json' with { type: 'json' };
import { loadContent } from '../content/content.ts';
import type { PropDef, RiseSide } from '../content/prop-types.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import type { CaveResult } from '../cave/generate.ts';
import { generateCave } from '../cave/generate.ts';
import type { CaveKit } from '../cave/kit.ts';
import { readKit } from '../cave/kit.ts';
import { CAVE_LAYOUT } from '../cave/layout.ts';
import { caveZone } from '../cave/make.ts';
import type { PlacedStair } from './stair-rise.ts';
import { rampRise, risesToward, stairProblems, turnToRise } from './stair-rise.ts';
import type { TerrainMap } from './terrain.ts';
import { terrainMap } from './terrain.ts';

const content: Content = loadContent();
const KITS: readonly CaveKit[] = [readKit(hourfall, 'hourfall'), readKit(lava, 'lava'), readKit(ledgerHall, 'ledger_hall')];
const SEEDS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8];
const SIDES: readonly RiseSide[] = ['+x', '-x', '+z', '-z'];

function stairsOf(zone: ZoneDef): PlacedStair[] {
  return zone.props.filter((placed): boolean => (content.props.get(placed.prop)?.rises ?? null) !== null);
}

function generated(kit: CaveKit, seed: number): ZoneDef {
  const result: CaveResult = generateCave({ seed, columns: 110, rows: 110, chambers: 8, levels: { from: 14, to: 17 }, packs: 12, packScale: 1, roomScale: 1, top: CAVE_LAYOUT.top, ranks: [], screen: { monsters: 40, lights: 40 } }, { kit, defs: content.props, judge: null });
  assert.ok(result.ok, result.ok ? '' : `${kit.id} seed ${seed}: ${result.problem}`);
  return caveZone(result.layout, { id: `${kit.id}_${seed}`, name: 'Stairs', up: { id: 'up', to: 'above', toExit: 'down', requires: [], lockedHint: '', hiddenWhenLocked: false }, down: null }, kit).zone;
}

void test('turning a stair by turnToRise makes it climb toward the side asked for, for every side it may climb in its own model', (): void => {
  for (const local of SIDES) {
    for (const world of SIDES) {
      const facing = risesToward(local, turnToRise(local, world));
      const toward = risesToward('+z', turnToRise('+z', world));
      assert.ok(Math.abs(facing.x - toward.x) < 1e-9 && Math.abs(facing.z - toward.z) < 1e-9, `${local} to ${world}`);
    }
  }
  const turned = risesToward('-z', 90);
  assert.ok(Math.abs(turned.x + 1) < 1e-9 && Math.abs(turned.z) < 1e-9);
  assert.equal(turnToRise('-z', '+z'), 180);
  assert.equal(rampRise('z', false), '-z');
  assert.equal(rampRise('x', true), '+x');
});

void test('a stair that climbs away from the high end of its ramp, or stands off a ramp, is named with the turn that fixes it', (): void => {
  const defs: ReadonlyMap<string, PropDef> = new Map<string, PropDef>([...content.props].filter(([, def]): boolean => def.rises !== null));
  const [id, def] = [...defs][0] ?? [];
  assert.ok(id !== undefined && def !== undefined && def.rises !== null);
  const map: TerrainMap = { columns: 1, rows: 3, cellSize: 2, surfaces: [{ kind: 'flat', height: 0 }, { kind: 'ramp', axis: 'z', start: 2, length: 2, from: 0, to: 2 }, { kind: 'flat', height: 2 }] };
  const right: number = turnToRise(def.rises, '+z');
  assert.deepEqual(stairProblems(map, [{ prop: id, x: 1, z: 3, rotationDegrees: right }], defs), []);
  const wrong: readonly string[] = stairProblems(map, [{ prop: id, x: 1, z: 3, rotationDegrees: right + 180 }], defs);
  assert.equal(wrong.length, 1);
  assert.match(wrong[0] ?? '', /\+z; turn it/);
  assert.equal(stairProblems(map, [{ prop: id, x: 1, z: 1, rotationDegrees: right }], defs).length, 1);
  assert.equal(stairProblems(null, [{ prop: id, x: 1, z: 3, rotationDegrees: right }], defs).length, 1);
});

void test('every stair placed in every zone stands on a ramp and climbs toward its high end', (): void => {
  const problems: string[] = [];
  let checked: number = 0;
  for (const zone of content.zones.values()) {
    const placed: PlacedStair[] = stairsOf(zone);
    checked += placed.length;
    problems.push(...stairProblems(terrainMap(zone), placed, content.props).map((problem: string): string => `${zone.id}: ${problem}`));
  }
  assert.ok(checked > 0);
  assert.deepEqual(problems, []);
});

void test('every stair the cave generator lays, from every kit, climbs toward the high end of its ramp, whichever way the passage runs', (): void => {
  const problems: string[] = [];
  let checked: number = 0;
  for (const kit of KITS) {
    for (const seed of SEEDS) {
      const zone: ZoneDef = generated(kit, seed);
      const placed: PlacedStair[] = stairsOf(zone);
      checked += placed.length;
      problems.push(...stairProblems(terrainMap(zone), placed, content.props).map((problem: string): string => `${zone.id}: ${problem}`));
    }
  }
  assert.ok(checked > 0);
  assert.deepEqual(problems, []);
});
