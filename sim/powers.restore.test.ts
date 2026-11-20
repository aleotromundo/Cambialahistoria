import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CONTENT, arena } from '../test/arena-support.ts';
import { must } from '../test/support.ts';
import { powerRuleProblems } from './content/power-rules.ts';
import { powerTrigger } from './content/parse-powers.ts';
import type { Content, SkillDef, SkillTreeNodeDef } from './content/types.ts';
import { firePowers } from './powers.ts';
import { refreshPlayer } from './world/character.ts';
import type { World } from './world/types.ts';

const DRINKER: SkillTreeNodeDef = { id: 'test_drinker', name: 'Drinker', description: '', icon: 'focus', kind: 'notable', path: 'blade', column: 90, row: 90, requires: [], statMods: [], skillMods: [], variants: [], unlock: null, weapon: null, triggers: [powerTrigger({ on: 'kill', effect: { type: 'restore', life: 6, mana: 4 } }, 'test')], stances: [], cluster: null, common: null, specialty: null };
const content: Content = { ...ARENA_CONTENT, skillTree: [...ARENA_CONTENT.skillTree, DRINKER] };
const cleave: SkillDef = must(content.skills.get('cleave'), 'cleave');

function drinker(): World {
  const world: World = arena(1, content);
  world.player.allocated = ['test_drinker'];
  refreshPlayer(world);
  return world;
}

void test('a restore trigger gives back life and mana on a kill, never past the maximum', (): void => {
  const world: World = drinker();
  world.player.life = world.player.maxLife - 10;
  world.player.mana = 0;
  firePowers(world, world.player, { on: 'kill', skill: cleave, target: null, at: world.player.pos });
  assert.equal(world.player.life, world.player.maxLife - 4);
  assert.equal(world.player.mana, 4);
  firePowers(world, world.player, { on: 'kill', skill: cleave, target: null, at: world.player.pos });
  firePowers(world, world.player, { on: 'kill', skill: cleave, target: null, at: world.player.pos });
  assert.equal(world.player.life, world.player.maxLife);
});

void test('a fallen hero is not restored', (): void => {
  const world: World = drinker();
  world.player.alive = false;
  world.player.life = 0;
  firePowers(world, world.player, { on: 'kill', skill: cleave, target: null, at: world.player.pos });
  assert.equal(world.player.life, 0);
});

void test('a restore reads life and mana as zero when left out, and the rules report one that restores nothing', (): void => {
  assert.deepEqual(powerTrigger({ on: 'hit', effect: { type: 'restore', mana: 2 } }, 'x').effect, { type: 'restore', life: 0, mana: 2 });
  assert.throws((): unknown => powerTrigger({ on: 'hit', effect: { type: 'restore', life: -1 } }, 'x'));
  const empty: SkillTreeNodeDef = { ...DRINKER, id: 'test_empty', triggers: [powerTrigger({ on: 'kill', effect: { type: 'restore' } }, 'test')] };
  assert.ok(powerRuleProblems({ ...content, skillTree: [...content.skillTree, empty] }).includes('tree node test_empty restores nothing'));
});
