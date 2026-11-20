import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import { createArena } from '../../sim/rl/arena.ts';
import { createDuel } from '../../sim/rl/duel.ts';
import { recordDuelReplay } from '../../sim/rl/duel-replay.ts';
import { recordReplay } from '../../sim/rl/replay.ts';
import type { LifeRow } from './duel-lives.ts';
import type { Watching } from './replay-watch.ts';
import { startWatching, watchedSeats, watchLives } from './replay-watch.ts';

const CONTENT: Content = loadContent();

function duelWatching(label: string): Watching {
  const replay = recordDuelReplay(createDuel(CONTENT, { seed: 7, jitter: 0 }), [[[0, 0, 0, 0]], [[0, 0, 0, 0]]], label);
  return startWatching(CONTENT, JSON.parse(JSON.stringify(replay)), 1);
}

void test('a duel replay gives both seats and a full life bar for each, named from its label', (): void => {
  const watching: Watching = duelWatching('match-first1');
  assert.equal(watchedSeats(watching)?.length, 2);
  const rows: LifeRow[] = watchLives(watching) ?? [];
  assert.deepEqual(rows.map((row: LifeRow): string => row.name), ['Second model', 'First model']);
  assert.deepEqual(rows.map((row: LifeRow): number => row.fraction), [1, 1]);
  assert.deepEqual(rows.map((row: LifeRow): string => row.standing), ['fighting', 'fighting']);
});

void test('an arena replay has no seats and no life bars', (): void => {
  const replay = recordReplay(createArena(CONTENT, { seed: 81, jitter: 0, waves: 1 }), [[0, 0, 0, 0]], 'test');
  const watching: Watching = startWatching(CONTENT, JSON.parse(JSON.stringify(replay)), 1);
  assert.equal(watchedSeats(watching), null);
  assert.equal(watchLives(watching), null);
});
