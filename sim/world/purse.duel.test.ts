import assert from 'node:assert/strict';
import { test } from 'node:test';
import { worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { LedgerItem, PurseEntry } from './ledger.ts';
import { applyPurse, stripLedger, unverifyLedger } from './purse.ts';
import type { Equipment, ItemInstance, World } from './types.ts';

const content: Content = loadContent();
const LEDGER: string = 'itm_DDDDDDDDDDDDDDDDDDDDDD';

function held(uid: number): ItemInstance {
  return { uid, base: 'rusted_blade', rarity: 'magic', level: 4, affixes: [], ledger: LEDGER };
}

function rolled(): LedgerItem {
  return { id: LEDGER, base: 'rusted_blade', rarity: 'magic', level: 4, affixes: [] };
}

function duelling(seed: number): { readonly world: World; readonly kept: Equipment } {
  const world: World = worldIn(content, content.world.town, seed);
  world.player.inventory = world.player.inventory.map((): ItemInstance | null => null);
  const kept: Equipment = { ...world.player.equipped, weapon: held(950) };
  world.setAside = kept;
  world.player.equipped.weapon = null;
  return { world, kept };
}

function bagged(world: World): number {
  return world.player.inventory.filter((item: ItemInstance | null): boolean => item?.ledger === LEDGER).length;
}

void test('an item in that the hero has set aside for a duel is not given twice', (): void => {
  const { world } = duelling(21);
  const arrived: PurseEntry = { id: 1, kind: 'collect', gold: 0, item: rolled(), direction: 'in' };
  applyPurse(world, [arrived]);
  assert.equal(bagged(world), 0);
});

void test('a stripped ledger id leaves the gear set aside for a duel', (): void => {
  const { world, kept } = duelling(22);
  assert.equal(stripLedger(world, [LEDGER]), true);
  assert.equal(kept.weapon, null);
});

void test('an unverified ledger id is cleared on the gear set aside for a duel', (): void => {
  const { world, kept } = duelling(23);
  assert.equal(unverifyLedger(world, [LEDGER]), true);
  assert.deepEqual(kept.weapon, { ...held(950), ledger: null });
});
