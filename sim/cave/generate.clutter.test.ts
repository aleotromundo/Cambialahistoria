import assert from 'node:assert/strict';
import { test } from 'node:test';
import hourfall from '../../data/kits/hourfall.json' with { type: 'json' };
import lava from '../../data/kits/lava.json' with { type: 'json' };
import ledgerHall from '../../data/kits/ledger_hall.json' with { type: 'json' };
import { must } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import { screenLoad } from './checks.ts';
import type { CaveProp, CaveResult } from './generate.ts';
import { clutters, generateCave } from './generate.ts';
import type { CaveKit, KitPiece } from './kit.ts';
import { readKit } from './kit.ts';
import { CAVE_LAYOUT } from './layout.ts';

const content: Content = loadContent();
const kit: CaveKit = readKit(lava, 'lava');

void test('a blocking piece of dressing clutters a room, and a light or a walk-through piece does not', (): void => {
  assert.equal(clutters(content.props.get('ash_ribs')), true);
  assert.equal(clutters(content.props.get('basalt_spires')), true);
  assert.equal(clutters(content.props.get('ash_skull')), false);
  assert.equal(clutters(content.props.get('lava_scree')), false);
  assert.equal(clutters(content.props.get('cave_crystal_big')), false);
});

void test('a generated cave dresses its rooms only with pieces the hero walks through', (): void => {
  const reference: ZoneDef = must(content.zones.get('lava_depths'), 'lava_depths');
  const result: CaveResult = generateCave(
    { seed: 3, columns: 110, rows: 110, chambers: 10, levels: { from: 19, to: 21 }, packs: 20, packScale: 1, roomScale: 1, top: CAVE_LAYOUT.top, ranks: [], screen: screenLoad(content, reference) },
    { kit, defs: content.props, judge: null },
  );
  assert.ok(result.ok, result.ok ? '' : result.problem);
  const dressing: ReadonlySet<string> = new Set<string>(kit.clusters.flatMap((cluster: readonly KitPiece[]): string[] => cluster.map((piece: KitPiece): string => piece.prop)));
  const blocking: string[] = result.layout.props.filter((placed: CaveProp): boolean => dressing.has(placed.prop) && clutters(content.props.get(placed.prop))).map((placed: CaveProp): string => placed.prop);
  assert.deepEqual(blocking, []);
});

void test('the cave and lava kits keep their floors open, and the Columned Hall keeps its columns', (): void => {
  assert.equal(readKit(hourfall, 'hourfall').openFloor, true);
  assert.equal(kit.openFloor, true);
  assert.equal(readKit(ledgerHall, 'ledger_hall').openFloor, false);
});
