import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, zoneOf } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content, ZoneDef } from './content/types.ts';
import { depthZones, shareOf, threatNear, threatOf, zoneDamageMix } from './threat.ts';

const content: Content = loadContent();
const caves: ZoneDef = zoneOf(content, 'under_hall_2');

function ids(zones: readonly ZoneDef[]): string[] {
  return zones.map((zone: ZoneDef): string => zone.id);
}

void test('a zone mixes the damage its monsters deal by kind, from their own skills', (): void => {
  const storm: ZoneDef = { ...caves, ranks: false, packs: [{ x: 0, z: 0, when: [], members: [{ monster: 'stormcaller_rival', count: 3, mods: [] }] }] };
  const rivalSkill: string = must(content.monsters.get('stormcaller_rival'), 'rival').skill;
  assert.equal(zoneDamageMix(content, storm)[must(content.skills.get(rivalSkill), 'skill').damage.type], 1);
  const frost: ZoneDef = { ...caves, ranks: false, packs: [{ x: 0, z: 0, when: [], members: [{ monster: 'still_standing', count: 2, mods: [] }] }] };
  assert.equal(zoneDamageMix(content, frost).frost, 1);
  assert.deepEqual(zoneDamageMix(content, { ...caves, packs: [] }), { physical: 1, storm: 0, frost: 0 });
});

void test('a volatile pack mod brings a little storm into a physical cave through its death burst', (): void => {
  const mix = zoneDamageMix(content, caves);
  assert.ok(mix.storm > 0 && mix.storm < 0.05);
  assert.equal(mix.frost, 0);
  const plain: ZoneDef = { ...caves, ranks: false };
  assert.equal(zoneDamageMix(content, plain).storm, 0);
  const volatile: ZoneDef = { ...plain, packs: [{ x: 0, z: 0, when: [], members: [{ monster: 'wolf', count: 1, mods: ['volatile'] }] }] };
  assert.ok(zoneDamageMix(content, volatile).storm > 0);
});

void test('the depth is the fighting zone the player stands in or the deepest one visited, and the one after it', (): void => {
  const hideout: ZoneDef = zoneOf(content, 'hideout');
  assert.deepEqual(ids(depthZones(content, ['hall_of_time', 'under_hall', 'under_hall_2'], hideout)), ['under_hall_2', 'under_hall_3']);
  assert.deepEqual(ids(depthZones(content, ['under_hall', 'under_hall_2', 'under_hall_3'], caves)), ['under_hall_2', 'under_hall_3']);
  assert.deepEqual(ids(depthZones(content, [], hideout)).length, 2);
  const deepest: ZoneDef = must([...content.zones.values()].filter((zone: ZoneDef): boolean => zone.kind === 'wild' && zone.packs.length > 0).toSorted((a: ZoneDef, b: ZoneDef): number => b.level - a.level)[0], 'deepest');
  assert.deepEqual(ids(depthZones(content, [deepest.id], hideout)), [deepest.id]);
});

void test('a threat weighs each zone equally and with nothing to fight every hit is physical', (): void => {
  const threat = threatNear(content, ['under_hall_2'], zoneOf(content, 'hideout'));
  const total: number = threat.shares.reduce((sum: number, entry): number => sum + entry.share, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  assert.ok(shareOf(threat, 'physical') > 0.95);
  assert.deepEqual(threatOf(content, []).shares, [{ type: 'physical', stormTier: 0, share: 1 }]);
});
