import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, ZoneDef } from '../../sim/content/types.ts';
import type { GroundBatches } from './ground.ts';
import { groundBatches, keepGroundOf } from './ground.ts';

function zoneOf(content: Content, id: string): ZoneDef {
  const zone: ZoneDef | undefined = content.zones.get(id);
  if (zone === undefined) throw new Error(`missing ${id}`);
  return zone;
}

void test('a zone ground left out of the kept zones is let go and shaped again on its next entry, and a kept one is reused', (): void => {
  const content: Content = loadContent();
  const left: ZoneDef = zoneOf(content, 'hideout');
  const kept: ZoneDef = zoneOf(content, 'keepers_gate');
  const leftGround: GroundBatches = groundBatches(content, left);
  const keptGround: GroundBatches = groundBatches(content, kept);
  keepGroundOf(content, new Set<ZoneDef>([kept]));
  assert.equal(groundBatches(content, kept), keptGround);
  const again: GroundBatches = groundBatches(content, left);
  assert.notEqual(again, leftGround);
  assert.deepEqual([...again.solid.keys()], [...leftGround.solid.keys()]);
});

void test('keeping the zones of one load of the content leaves the ground of another load alone', (): void => {
  const content: Content = loadContent();
  const other: Content = loadContent();
  const zone: ZoneDef = zoneOf(other, 'ledger_court');
  const shaped: GroundBatches = groundBatches(other, zone);
  keepGroundOf(content, new Set<ZoneDef>());
  assert.equal(groundBatches(other, zone), shaped);
});
