import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { MonsterTrail } from '../content/combat-types.ts';
import { stepTrail, trailAreas } from './trail.ts';
import type { MonsterState, World } from './types.ts';

void test('a Mire Spitter lays silt only after retreating, and stops at two active pools', (): void => {
  const world: World = arena(4);
  const monster: MonsterState = place(world, 'mire_spitter', ARENA_CENTRE);
  const trail: MonsterTrail = must(monster.def.trail, 'Mire Spitter trail');

  monster.stance = 'approach';
  monster.pos.x += trail.every * 2;
  stepTrail(world, monster);
  assert.equal(trailAreas(world, monster, trail.skill), 0);

  monster.stance = 'retreat';
  monster.pos.x += trail.every * 0.75;
  stepTrail(world, monster);
  assert.equal(trailAreas(world, monster, trail.skill), 0);

  monster.pos.x += trail.every * 0.5;
  stepTrail(world, monster);
  assert.equal(trailAreas(world, monster, trail.skill), 1);

  monster.stance = 'engage';
  monster.pos.x += trail.every;
  stepTrail(world, monster);

  monster.stance = 'retreat';
  monster.pos.x -= trail.every * 0.75;
  stepTrail(world, monster);
  assert.equal(trailAreas(world, monster, trail.skill), 1);

  monster.pos.x -= trail.every;
  stepTrail(world, monster);
  monster.pos.x -= trail.every * 1.25;
  stepTrail(world, monster);
  assert.equal(trailAreas(world, monster, trail.skill), 2);
});
