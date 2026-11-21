import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { generateItem } from '../items.ts';
import { createRng } from '../rng.ts';
import { dropOnGround } from './ground.ts';
import { pickUp } from './finds.ts';
import type { GroundItem, ItemInstance, World } from './types.ts';

const content: Content = loadContent();

function blade(uid: number): ItemInstance {
  return must(generateItem(content, createRng(uid), uid, 1, 'rusted_blade', 'common'), 'blade');
}

void test('a find picked up with a full pack is tossed back from the hand to where it lay', (): void => {
  const world: World = worldIn(content, content.world.town, 5);
  world.player.inventory.fill(blade(910));
  const ground: GroundItem = dropOnGround(world, world.player.pos, { kind: 'item', item: blade(911) });
  ground.age = 4;
  world.player.pos = { x: ground.pos.x + 0.6, z: ground.pos.z };
  const lay = { x: ground.pos.x, z: ground.pos.z };
  world.events = [];
  pickUp(world, ground);
  assert.ok(world.ground.includes(ground));
  assert.equal(ground.age, 0);
  assert.deepEqual(ground.from, { x: world.player.pos.x, z: world.player.pos.z });
  assert.deepEqual(ground.pos, lay);
  assert.ok(world.events.some((event): boolean => event.type === 'notice' && event.reason === 'inventory_full'));
});

void test('a find that fits is taken, not tossed back', (): void => {
  const world: World = worldIn(content, content.world.town, 6);
  const ground: GroundItem = dropOnGround(world, world.player.pos, { kind: 'item', item: blade(912) });
  ground.age = 4;
  pickUp(world, ground);
  assert.ok(!world.ground.includes(ground));
});
