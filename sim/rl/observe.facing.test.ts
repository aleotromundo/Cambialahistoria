import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dummy, offset, shapeArena, SHAPE_DT } from '../../test/shape-support.ts';
import { stepWorld } from '../world/step.ts';
import type { MonsterState, World } from '../world/types.ts';
import { ENTITY_FEATURES, RL, SELF_FEATURES, SLOT_FEATURES } from './contract.ts';
import { TAKE_ALL } from './loot.ts';
import type { Observation, Seen } from './observe.ts';
import { observe } from './observe.ts';
import { createRecall } from './recall.ts';

const CLOSE = 1e-6;

function seenOf(world: World): Observation {
  return observe(world, { situation: 'arena', objective: null, timeLeft: 0, progress: 0, recall: createRecall(), pickup: TAKE_ALL }, world.player);
}

function acting(world: World): boolean {
  return world.player.action !== null;
}

function selfValue(seen: Observation, name: string): number {
  return seen.obs[SELF_FEATURES.indexOf(name)] ?? Number.NaN;
}

function entityValue(seen: Observation, index: number, name: string): number {
  return seen.obs[SELF_FEATURES.length + RL.slots * SLOT_FEATURES.length + index * ENTITY_FEATURES.length + ENTITY_FEATURES.indexOf(name)] ?? Number.NaN;
}

void test('the hero reads which way it faces on the same axes as the world', (): void => {
  const world: World = shapeArena([]);
  world.player.facing = Math.PI / 2;
  const east: Observation = seenOf(world);
  assert.ok(Math.abs(selfValue(east, 'facing_x') - 1) < CLOSE);
  assert.ok(Math.abs(selfValue(east, 'facing_z')) < CLOSE);
  world.player.facing = 0;
  const north: Observation = seenOf(world);
  assert.ok(Math.abs(selfValue(north, 'facing_x')) < CLOSE);
  assert.ok(Math.abs(selfValue(north, 'facing_z') - 1) < CLOSE);
});

void test('a foe facing the hero reads a direction that points at the hero', (): void => {
  const world: World = shapeArena([]);
  world.player.pos = offset(0, 0);
  const foe: MonsterState = dummy(world, offset(4, 0));
  foe.facing = -Math.PI / 2;
  const seen: Observation = seenOf(world);
  const index: number = seen.view.seen.findIndex((entry: Seen): boolean => entry.type === 'monster' && entry.monster === foe);
  assert.ok(index >= 0);
  assert.ok(Math.abs(entityValue(seen, index, 'dir_x') + 1) < CLOSE);
  assert.ok(Math.abs(entityValue(seen, index, 'dir_z')) < CLOSE);
});

void test('the hero reads that it is still turning toward a cast aimed behind it, and stops reading it once the cast starts', (): void => {
  const world: World = shapeArena(['cleave']);
  world.player.pos = offset(0, 0);
  world.player.facing = 0;
  stepWorld(world, [{ type: 'skill', slot: 0, aim: offset(0, -3), targetId: null }], SHAPE_DT);
  assert.equal(acting(world), false);
  assert.equal(selfValue(seenOf(world), 'turning'), 1);
  for (let step: number = 0; step < 120 && !acting(world); step += 1) stepWorld(world, [], SHAPE_DT);
  assert.equal(acting(world), true);
  assert.equal(selfValue(seenOf(world), 'turning'), 0);
});
