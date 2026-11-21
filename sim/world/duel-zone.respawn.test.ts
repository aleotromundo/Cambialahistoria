import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { must } from '../../test/support.ts';
import { RING, ringContent, ringWorld } from '../../test/rival-support.ts';
import { startRivalDuel } from '../rl/rival.ts';
import { stepWorld } from './step.ts';
import type { World, WorldEvent } from './types.ts';

const CONTENT: Content = ringContent(loadContent());

function respawned(events: readonly WorldEvent[]): boolean {
  return events.some((event: WorldEvent): boolean => event.type === 'player_respawn');
}

void test('a fallen duellist rises as they leave, so their body stands up at home', (): void => {
  const world: World = ringWorld(CONTENT, 5, 8);
  must(startRivalDuel(world, 5), 'duel');
  world.player.alive = false;
  world.player.life = 0;
  const events: WorldEvent[] = stepWorld(world, [{ type: 'leave_duel' }], 1 / 30);
  assert.equal(world.zone.id, RING.home.zone);
  assert.ok(world.player.alive);
  assert.ok(respawned(events));
});

void test('a standing duellist walks home without rising again', (): void => {
  const world: World = ringWorld(CONTENT, 6, 8);
  must(startRivalDuel(world, 6), 'duel');
  assert.ok(!respawned(stepWorld(world, [{ type: 'leave_duel' }], 1 / 30)));
});
