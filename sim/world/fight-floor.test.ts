import assert from 'node:assert/strict';
import { test } from 'node:test';
import hourfall from '../../data/kits/hourfall.json' with { type: 'json' };
import lava from '../../data/kits/lava.json' with { type: 'json' };
import { must } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, PropDef, ZoneDef, ZoneProp } from '../content/types.ts';
import type { CaveKit, KitPiece } from '../cave/kit.ts';
import { readKit } from '../cave/kit.ts';
import { cellCenter } from '../nav/grid.ts';
import type { Vec2 } from '../math.ts';
import type { FloorClutter, WallReach } from './fight-floor.ts';
import { clutterOnFightFloor, FIGHT_FLOOR, wallReach } from './fight-floor.ts';

const content: Content = loadContent();
const kits: readonly CaveKit[] = [readKit(hourfall, 'hourfall'), readKit(lava, 'lava')];
const clutter: ReadonlySet<string> = new Set<string>(
  kits.flatMap((kit: CaveKit): string[] => kit.clusters.flatMap((cluster: readonly KitPiece[]): string[] => cluster.map((piece: KitPiece): string => piece.prop))).filter((id: string): boolean => must(content.props.get(id), id).light === null),
);

function spotWhere(reach: WallReach, keep: (fromWall: number) => boolean): Vec2 {
  const index: number = reach.fromWall.findIndex((fromWall: number, at: number): boolean => reach.grid.ground[at] === 1 && keep(fromWall));
  assert.ok(index >= 0);
  return cellCenter(reach.grid, index);
}

function placing(zone: ZoneDef, prop: string, at: Vec2): ZoneDef {
  const added: ZoneProp = { prop, x: at.x, z: at.z, y: 0, rotationDegrees: 0, when: [] };
  return { ...zone, props: [...zone.props, added] };
}

void test('no cave or lava level puts a blocking piece of its dressing in the middle of a room, where the hero fights', (): void => {
  const found: string[] = [...content.zones.values()].flatMap((zone: ZoneDef): string[] =>
    clutterOnFightFloor(zone, content, clutter).map((piece: FloorClutter): string => `${zone.id} ${piece.placed.prop} at ${String(piece.placed.x)}, ${String(piece.placed.z)}, ${piece.fromWall.toFixed(1)} m from a wall`),
  );
  assert.deepEqual(found, []);
});

void test('a blocking piece of dressing is reported in the open and left alone against a wall', (): void => {
  const zone: ZoneDef = must(content.zones.get('lava_depths_2'), 'lava_depths_2');
  const reach: WallReach = wallReach(zone, content);
  const open: Vec2 = spotWhere(reach, (fromWall: number): boolean => fromWall > FIGHT_FLOOR.wall * 2);
  const edge: Vec2 = spotWhere(reach, (fromWall: number): boolean => fromWall > 1 && fromWall < FIGHT_FLOOR.wall);
  assert.equal(clutterOnFightFloor(placing(zone, 'ash_ribs', open), content, clutter).length, 1);
  assert.equal(clutterOnFightFloor(placing(zone, 'ash_ribs', edge), content, clutter).length, 0);
  assert.equal(clutterOnFightFloor(placing(zone, 'ash_skull', open), content, clutter).length, 0);
});

void test('low debris the hero can step over never blocks him', (): void => {
  for (const id of ['lava_scree', 'cave_scree', 'ash_ribcage', 'cave_ribcage', 'lava_slab_pile', 'lava_barrel_wreck', 'cave_barrel_wreck', 'cave_crystal']) {
    const def: PropDef = must(content.props.get(id), id);
    assert.equal(def.footprints.length, 0, id);
  }
});
