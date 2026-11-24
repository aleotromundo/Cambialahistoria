import assert from 'node:assert/strict';
import { test } from 'node:test';
import { offset, shapeArena, shapeSkill } from '../test/shape-support.ts';
import { hotGround } from './bot-ground.ts';
import { placeArea } from './world/areas.ts';
import { offenceOf } from './world/combat.ts';
import type { PlayerState, World } from './world/types.ts';

const DUEL = { rival: 1 } as const;

void test('a burning line is hot all along its length for a rival hero, and not beside it', (): void => {
  const world: World = shapeArena([]);
  world.player.pos = offset(0, 0);
  const apart: PlayerState = shapeArena([]).player;
  const rival: PlayerState = { ...apart, id: world.nextId, pos: offset(6, 0), party: DUEL.rival };
  world.nextId += 1;
  world.heroes.push(rival);
  assert.ok(placeArea(world, offenceOf(world.player), shapeSkill('fire_slam_line'), offset(0, 0), { x: 1, z: 0 }) !== null);
  assert.equal(hotGround(world, offset(6, 0), rival), true);
  assert.equal(hotGround(world, offset(6, 3), rival), false);
});
