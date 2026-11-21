import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { PlayerState } from '../world/types.ts';
import { buildPoints } from './build.ts';
import type { Match, Pool, PoolOptions } from './pool.ts';
import { createPool } from './pool.ts';
import { recordReplay } from './replay.ts';

const CONTENT: Content = loadContent();
const BASE: PoolOptions = { seed: 41, envs: 6, duels: 2, jitter: 0, waves: 1, keepEvery: 1, levels: [], treeBuilds: true };

function heroes(match: Match): PlayerState[] {
  return match.kind === 'arena' ? [match.arena.world.player] : match.duel.seats.map((seat): PlayerState => seat.hero);
}

void test('a tree-build pool gives every arena and both duel seats a tree build at a level from the range', (): void => {
  const pool: Pool = createPool(CONTENT, { ...BASE, range: { min: 25, max: 30 } });
  for (const match of pool.matches) {
    for (const hero of heroes(match)) {
      assert.ok(hero.level >= 25 && hero.level <= 30, `level ${hero.level}`);
      assert.equal(hero.allocated.length, buildPoints(CONTENT, hero.level));
      assert.equal(hero.skillPoints, 0);
    }
  }
  const duel: Match | undefined = pool.matches.find((match: Match): boolean => match.kind === 'duel');
  assert.ok(duel?.kind === 'duel');
  assert.equal(duel.duel.options.builds?.length, 2);
  assert.notDeepEqual(duel.duel.seats[0]?.hero.allocated, duel.duel.seats[1]?.hero.allocated);
});

void test('a tree-build pool follows the level weights', (): void => {
  const weights: number[] = Array.from({ length: 30 }, (_unused: unknown, index: number): number => (index === 29 ? 1 : 0));
  const pool: Pool = createPool(CONTENT, { ...BASE, range: { min: 1, max: 30 }, levels: weights });
  for (const match of pool.matches) for (const hero of heroes(match)) assert.equal(hero.level, 30);
});

void test('a tree-build arena keeps its build in the replay it records', (): void => {
  const pool: Pool = createPool(CONTENT, { ...BASE, envs: 1, duels: 0, range: { min: 20, max: 20 } });
  const first: Match | undefined = pool.matches[0];
  assert.ok(first?.kind === 'arena');
  const kept = recordReplay(first.arena, [], 'tree');
  assert.deepEqual(kept.options.build?.route, first.arena.world.player.allocated);
  assert.equal(kept.options.level, 20);
});
