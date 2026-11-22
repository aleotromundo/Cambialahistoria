import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { RivalOutcome } from '../../sim/rl/rival.ts';
import type { PlayerState } from '../../sim/world/types.ts';
import { worldIn } from '../../test/support.ts';
import type { LifeRow } from '../watch/duel-lives.ts';
import { duelLives } from '../watch/duel-lives.ts';
import { rivalLives, rivalVerdict } from './rival-lives.ts';

const PLAYER: PlayerState = worldIn(loadContent(), 'hideout', 1).player;

function hero(life: number, alive: boolean = true): PlayerState {
  return { ...PLAYER, life, maxLife: 200, alive };
}

void test('the player stands on the left as You and the rival on the right, each with a share of life', (): void => {
  const rows: LifeRow[] = rivalLives('fighting', hero(50), hero(200));
  assert.deepEqual(rows.map((row: LifeRow): string => row.name), ['You', 'Rival']);
  assert.deepEqual(rows.map((row: LifeRow): number => row.side), [0, 1]);
  assert.deepEqual(rows.map((row: LifeRow): number => row.fraction), [0.25, 1]);
  assert.deepEqual(rows.map((row: LifeRow): string => row.result), ['', '']);
  assert.equal(rivalVerdict('fighting'), null);
});

void test('a fallen or vanished hero shows an empty bar', (): void => {
  assert.deepEqual(rivalLives('won', hero(80), hero(30, false)).map((row: LifeRow): number => row.fraction), [0.4, 0]);
  assert.deepEqual(rivalLives('won', hero(80), null).map((row: LifeRow): number => row.fraction), [0.4, 0]);
});

function results(outcome: RivalOutcome): string[] {
  return rivalLives(outcome, hero(10), hero(10)).map((row: LifeRow): string => row.result);
}

void test('each ending marks both bars and says who won', (): void => {
  assert.deepEqual(results('won'), ['Wins', 'Down']);
  assert.deepEqual(results('lost'), ['Down', 'Wins']);
  assert.deepEqual(results('resigned'), ['', 'Wins']);
  assert.equal(rivalVerdict('won'), 'You win');
  assert.equal(rivalVerdict('lost'), 'The rival wins');
  assert.equal(rivalVerdict('resigned'), 'You resigned');
  assert.equal(rivalVerdict('left'), null);
});

void test('replays keep naming their seats for the models', (): void => {
  assert.deepEqual(duelLives('', [{ life: 1, maxLife: 1, outcome: 'running' }]).map((row: LifeRow): string => row.name), ['First model']);
});
