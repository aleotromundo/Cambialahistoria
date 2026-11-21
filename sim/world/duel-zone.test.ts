import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { must, worldIn, zoneOf } from '../../test/support.ts';
import { RING, ringContent, ringWorld } from '../../test/rival-support.ts';
import { startRivalDuel } from '../rl/rival.ts';
import { stepWorld } from './step.ts';
import type { World, WorldEvent } from './types.ts';
import { enterZone } from './zones.ts';

const CONTENT: Content = ringContent(loadContent());

void test('leaving a duel outside a duel zone does nothing', (): void => {
  const world: World = worldIn(CONTENT, 'hideout', 2);
  const events: WorldEvent[] = stepWorld(world, [{ type: 'leave_duel' }], 1 / 30);
  assert.equal(world.zone.id, 'hideout');
  assert.ok(!events.some((event: WorldEvent): boolean => event.type === 'zone_changed'));
});

void test('leaving a duel zone any other way also sends the rival away', (): void => {
  const world: World = ringWorld(CONTENT, 3, 8);
  must(startRivalDuel(world, 3), 'duel');
  assert.equal(world.heroes.length, 2);
  enterZone(world, zoneOf(CONTENT, RING.home.zone), { type: 'start' });
  assert.deepEqual(world.heroes, [world.player]);
});

void test('leaving puts the player at the home exit', (): void => {
  const world: World = ringWorld(CONTENT, 4, 8);
  must(startRivalDuel(world, 4), 'duel');
  const events: WorldEvent[] = stepWorld(world, [{ type: 'leave_duel' }], 1 / 30);
  assert.equal(world.zone.id, RING.home.zone);
  assert.deepEqual(world.respawn, { type: 'exit', exit: RING.home.exit });
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'zone_changed'));
});
