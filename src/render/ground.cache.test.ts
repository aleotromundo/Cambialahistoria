import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, ZoneDef } from '../../sim/content/types.ts';
import type { GroundBatches } from './ground.ts';
import { keepZones } from '../../sim/zone-cache.ts';
import { groundBatches } from './ground.ts';

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
  keepZones(left, new Set<ZoneDef>([kept]));
  assert.equal(groundBatches(content, kept), keptGround);
  const again: GroundBatches = groundBatches(content, left);
  assert.notEqual(again, leftGround);
  assert.deepEqual([...again.solid.keys()], [...leftGround.solid.keys()]);
});

void test('the ground of the zone the hero stands in is let go once its view is built, so a phone that keeps no zones holds no ground', (): void => {
  const content: Content = loadContent();
  const standing: ZoneDef = zoneOf(content, 'ledger_court');
  const shaped: GroundBatches = groundBatches(content, standing);
  keepZones(standing, new Set<ZoneDef>());
  assert.notEqual(groundBatches(content, standing), shaped);
});

void test('a zone ground is shaped again for another load of the content rather than reused across loads', (): void => {
  const content: Content = loadContent();
  const other: Content = loadContent();
  const zone: ZoneDef = zoneOf(content, 'ledger_court');
  const shaped: GroundBatches = groundBatches(content, zone);
  assert.notEqual(groundBatches(other, zone), shaped);
});
