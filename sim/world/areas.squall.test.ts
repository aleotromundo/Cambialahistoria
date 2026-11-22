import assert from 'node:assert/strict';
import { test } from 'node:test';
import { faceAt } from '../../test/facing-support.ts';
import { cast, damageTo, dummy, offset, run, shapeArena } from '../../test/shape-support.ts';
import { must } from '../../test/support.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import type { AreaState, MonsterState, World, WorldEvent } from './types.ts';

void test('Squall forms on the caster however far away it is aimed', (): void => {
  const world: World = shapeArena(['squall']);
  const near: MonsterState = dummy(world, offset(2, 0));
  const aimed: MonsterState = dummy(world, offset(9, 0));
  const stood: Vec2 = { ...world.player.pos };
  faceAt(world.player, offset(9, 0));
  const events: WorldEvent[] = [...cast(world, 0, offset(9, 0)), ...run(world, 1.2)];
  const area: AreaState = must(world.areas[0], 'squall');
  assert.ok(distance(area.pos, stood) < 0.01);
  assert.ok(damageTo(events, near.id).length > 0);
  assert.equal(damageTo(events, aimed.id).length, 0);
});

void test('Squall stays where it formed when the caster walks away', (): void => {
  const world: World = shapeArena(['squall']);
  const stood: Vec2 = { ...world.player.pos };
  faceAt(world.player, offset(9, 0));
  cast(world, 0, offset(9, 0));
  run(world, 0.4);
  run(world, 1.5, [{ type: 'move', held: false, dest: offset(-6, 0) }]);
  const area: AreaState = must(world.areas[0], 'squall');
  assert.ok(distance(area.pos, stood) < 0.01);
  assert.ok(distance(world.player.pos, stood) > 2);
});
