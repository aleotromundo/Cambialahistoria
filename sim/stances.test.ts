import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CONTENT, arena } from '../test/arena-support.ts';
import type { Content, SkillTreeNodeDef, StanceMod } from './content/types.ts';
import { liveStances, placedStances, stanceMods, stepStances } from './stances.ts';
import { refreshPlayer } from './world/character.ts';
import { stepWorld } from './world/step.ts';
import type { World } from './world/types.ts';

function stancePlace(id: string, stances: readonly StanceMod[], weapon: string | null = null): SkillTreeNodeDef {
  return { id, name: id, description: '', icon: 'focus', kind: 'notable', path: 'blade', column: 90, row: 90, requires: [], statMods: [], skillMods: [], variants: [], unlock: null, weapon, triggers: [], stances, cluster: null, common: null, specialty: null };
}

const RUNNING: SkillTreeNodeDef = stancePlace('test_running', [{ when: 'moving', statMods: [{ stat: 'damagePercent', op: 'add', value: 0.2 }] }, { when: 'still', statMods: [{ stat: 'armour', op: 'add', value: 30 }] }]);
const CORNERED: SkillTreeNodeDef = stancePlace('test_cornered', [{ when: 'low_life', statMods: [{ stat: 'armour', op: 'add', value: 50 }] }]);
const FRESH: SkillTreeNodeDef = stancePlace('test_fresh', [{ when: 'full_life', statMods: [{ stat: 'critChance', op: 'add', value: 0.1 }] }]);
const ELSEWHERE: SkillTreeNodeDef = stancePlace('test_elsewhere', [{ when: 'moving', statMods: [{ stat: 'damagePercent', op: 'add', value: 1 }] }], 'crossbow');
const content: Content = { ...ARENA_CONTENT, skillTree: [...ARENA_CONTENT.skillTree, RUNNING, CORNERED, FRESH, ELSEWHERE] };

function holding(ids: readonly string[]): World {
  const world: World = arena(1, content);
  world.player.allocated = [...ids];
  world.player.wielding = 'blade';
  refreshPlayer(world);
  stepStances(content, world.player);
  refreshPlayer(world);
  return world;
}

void test('a stance holds only while its condition does, and only stances some held place names are live', (): void => {
  const held: readonly StanceMod[] = [...RUNNING.stances, ...CORNERED.stances];
  assert.deepEqual(liveStances(content, held, { moving: true, life: 100, maxLife: 100 }), ['moving']);
  assert.deepEqual(liveStances(content, held, { moving: false, life: 30, maxLife: 100 }), ['still', 'low_life']);
  assert.deepEqual(liveStances(content, held, { moving: false, life: 36, maxLife: 100 }), ['still']);
  assert.deepEqual(liveStances(content, CORNERED.stances, { moving: true, life: 100, maxLife: 100 }), []);
  assert.deepEqual(stanceMods(held, ['moving']), [{ stat: 'damagePercent', op: 'add', value: 0.2 }]);
});

void test('a place held for another weapon keeps no stance', (): void => {
  assert.deepEqual(placedStances(content, ['test_elsewhere'], 'blade'), []);
  assert.equal(placedStances(content, ['test_elsewhere'], 'crossbow').length, 1);
});

void test('moving and standing still swap the stats a stance place gives, and nothing changes while the stance holds', (): void => {
  const world: World = holding(['test_running']);
  const still: number = world.player.stats.armour;
  const calm: number = world.player.stats.damagePercent;
  world.player.moving = true;
  assert.equal(stepStances(content, world.player), true);
  refreshPlayer(world);
  assert.ok(Math.abs(world.player.stats.damagePercent - calm - 0.2) < 1e-9);
  assert.ok(Math.abs(still - world.player.stats.armour - 30) < 1e-9);
  assert.equal(stepStances(content, world.player), false);
});

void test('falling to low life turns on a low life stance within a step of the world, and healing turns it off', (): void => {
  const world: World = holding(['test_cornered', 'test_fresh']);
  const armour: number = world.player.stats.armour;
  const crit: number = world.player.stats.critChance;
  world.player.life = world.player.maxLife * 0.2;
  stepWorld(world, [], 1 / 60);
  assert.ok(Math.abs(world.player.stats.armour - armour - 50) < 1e-9);
  assert.ok(Math.abs(world.player.stats.critChance - (crit - 0.1)) < 1e-9);
  world.player.life = world.player.maxLife;
  stepWorld(world, [], 1 / 60);
  assert.ok(Math.abs(world.player.stats.armour - armour) < 1e-9);
  assert.ok(Math.abs(world.player.stats.critChance - crit) < 1e-9);
});
