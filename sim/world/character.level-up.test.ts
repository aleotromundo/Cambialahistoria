import assert from 'node:assert/strict';
import { test } from 'node:test';
import { armed, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { xpToNextLevel } from '../progression.ts';
import { grantXp } from './character.ts';
import type { World, WorldEvent } from './types.ts';

const content: Content = loadContent();

function hurt(): World {
  const world: World = armed(worldIn(content, 'hall_of_time', 1));
  world.player.life = 1;
  world.player.mana = 0;
  world.events.length = 0;
  return world;
}

void test('a level gained fills life and mana to their new, higher maximums', (): void => {
  const world: World = hurt();
  const lifeBefore: number = world.player.maxLife;
  grantXp(world, xpToNextLevel(content.player.xp, world.player.level));
  assert.equal(world.player.level, 2);
  assert.ok(world.player.maxLife > lifeBefore);
  assert.equal(world.player.life, world.player.maxLife);
  assert.equal(world.player.mana, world.player.stats.maxMana);
  assert.ok(world.events.some((event: WorldEvent): boolean => event.type === 'level_up'));
});

void test('two levels at once still end with life and mana full', (): void => {
  const world: World = hurt();
  const both: number = xpToNextLevel(content.player.xp, 1) + xpToNextLevel(content.player.xp, 2);
  grantXp(world, both);
  assert.equal(world.player.level, 3);
  assert.equal(world.player.life, world.player.maxLife);
  assert.equal(world.player.mana, world.player.stats.maxMana);
});

void test('xp that does not reach the next level leaves life and mana where they were', (): void => {
  const world: World = hurt();
  grantXp(world, 1);
  assert.equal(world.player.level, 1);
  assert.equal(world.player.life, 1);
  assert.equal(world.player.mana, 0);
});
