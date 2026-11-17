import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arena } from '../../test/arena-support.ts';
import { mendActor } from './mend.ts';
import type { World, WorldEvent } from './types.ts';

void test('mending adds life up to the most, tells how much it gave, and gives nothing to the dead or the full', (): void => {
  const world: World = arena(1);
  const player = world.player;
  player.life = player.maxLife - 5;
  mendActor(world, player, 20);
  assert.equal(player.life, player.maxLife);
  assert.deepEqual(world.events.filter((event: WorldEvent): boolean => event.type === 'mend'), [{ type: 'mend', actorId: player.id, amount: 5 }]);
  mendActor(world, player, 20);
  player.alive = false;
  player.life = 1;
  mendActor(world, player, 20);
  assert.equal(player.life, 1);
  assert.equal(world.events.filter((event: WorldEvent): boolean => event.type === 'mend').length, 1);
});
