import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { TradePricing } from './content/trade-types.ts';
import type { Content, RarityDef } from './content/types.ts';
import { identifyCost, revealed, veiled } from './identify.ts';
import { sellPrice } from './world/trade.ts';
import type { ItemInstance, RolledAffix } from './world/types.ts';

const content: Content = loadContent();

const GOLD_SINK = {
  topLevel: 200,
} as const;

function rarityOf(id: string): RarityDef {
  return must(
    content.rarities.find((rarity: RarityDef): boolean => rarity.id === id),
    id,
  );
}

function lines(count: number): RolledAffix[] {
  return Array.from({ length: count }, (_: unknown, index: number): RolledAffix => ({ affix: `line_${index}`, value: 1 }));
}

function found(rarity: string, level: number, affixes: number): ItemInstance {
  return veiled(content, { uid: level * 100 + affixes, base: 'gale_charm', rarity, level, affixes: lines(affixes), ledger: null });
}

function topSellGrowth(pricing: TradePricing, rarity: RarityDef): number {
  const multiplier: number = pricing.rarity[rarity.id] ?? 1;
  return pricing.base * multiplier * (1 + pricing.perAffix * rarity.affixMax) * pricing.sellRatio * pricing.perLevel;
}

void test('identifying a find always costs more than the trader pays for it once it is read', (): void => {
  const rarities: readonly string[] = Object.keys(content.trade.identify.prices);
  assert.ok(rarities.length > 0);
  for (const id of rarities) {
    const rarity: RarityDef = rarityOf(id);
    for (let level: number = 1; level <= GOLD_SINK.topLevel; level += 1) {
      for (let affixes: number = 0; affixes <= rarity.affixMax; affixes += 1) {
        const hidden: ItemInstance = found(id, level, affixes);
        const cost: number = identifyCost(content, hidden);
        const paid: number = sellPrice(content, revealed(hidden));
        assert.ok(cost > paid, `${id} level ${level} with ${affixes} lines costs ${cost} to identify and sells for ${paid}`);
      }
    }
  }
});

void test('the identify price grows at least as fast per level as the best identified sale, so no deeper level turns it to profit', (): void => {
  for (const [id, price] of Object.entries(content.trade.identify.prices)) {
    const rarity: RarityDef = rarityOf(id);
    assert.ok(price.base * price.perLevel >= topSellGrowth(content.trade.price, rarity), `${id} identify price grows slower per level than its best sale`);
  }
});

void test('selling a find after identifying it wins back less than half of what identifying it cost', (): void => {
  for (const id of Object.keys(content.trade.identify.prices)) {
    const rarity: RarityDef = rarityOf(id);
    for (const level of [1, 10, 20, 30]) {
      const hidden: ItemInstance = found(id, level, rarity.affixMax);
      assert.ok(sellPrice(content, revealed(hidden)) * 2 < identifyCost(content, hidden), `${id} level ${level} wins back half its identify price`);
    }
  }
});
