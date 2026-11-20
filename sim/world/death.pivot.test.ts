import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OUTPOST_CONTENT } from '../../test/road-support.ts';
import { must, worldIn } from '../../test/support.ts';
import type { Content, SkillDef } from '../content/types.ts';
import { choicesOpen } from './death.ts';
import { stepWorld } from './step.ts';
import type { MonsterState, World, WorldEvent } from './types.ts';

const content: Content = OUTPOST_CONTENT;
const DT: number = 1 / 60;
const AFTER = { seconds: 1, choiceWait: 900 } as const;

void test('a hero who dies while turning toward a cast comes back without that cast still waiting to start', (): void => {
  const world: World = worldIn(content, 'outpost', 3);
  const monster: MonsterState = must(world.monsters.find((candidate: MonsterState): boolean => candidate.def.boss === null && candidate.alive), 'monster');
  monster.spawnTime = 0;
  world.player.stats.lifeRegen = 0;
  world.player.pos = { x: monster.pos.x, z: monster.pos.z + 1.5 };
  world.player.life = 1;
  for (let step: number = 0; step < AFTER.choiceWait && world.player.alive; step += 1) stepWorld(world, [], DT);
  assert.equal(world.player.alive, false);
  const cleave: SkillDef = must(content.skills.get('cleave'), 'cleave');
  world.player.pivot = { skill: cleave, at: { x: world.player.pos.x, z: world.player.pos.z - 3 }, slot: 0 };
  for (let step: number = 0; step < AFTER.choiceWait && !choicesOpen(world); step += 1) stepWorld(world, [], DT);
  stepWorld(world, [{ type: 'respawn', choice: 'checkpoint' }], DT);
  assert.equal(world.player.alive, true);
  assert.equal(world.player.pivot, null);
  const events: WorldEvent[] = [];
  for (let step: number = 0; step < Math.round(AFTER.seconds / DT); step += 1) events.push(...stepWorld(world, [], DT));
  assert.equal(events.some((event: WorldEvent): boolean => event.type === 'skill_start' && event.actorId === world.player.id), false);
});
