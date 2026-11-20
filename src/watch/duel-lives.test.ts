import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LifeRow, SeatLife } from './duel-lives.ts';
import { duelLives, duelVerdict, firstSeatOf } from './duel-lives.ts';

function seat(life: number, maxLife: number, outcome: SeatLife['outcome']): SeatLife {
  return { life, maxLife, outcome };
}

void test('the replay label says which seat the first model sits in', (): void => {
  assert.equal(firstSeatOf('match-first0', 2), 0);
  assert.equal(firstSeatOf('match-first1', 2), 1);
  assert.equal(firstSeatOf('', 2), 0);
  assert.equal(firstSeatOf('match-first7', 2), 0);
  assert.equal(firstSeatOf('firstrun', 2), 0);
});

void test('each seat is named for its model and shows its share of life', (): void => {
  const rows: LifeRow[] = duelLives('match-first1', [seat(30, 120, 'running'), seat(90, 90, 'running')]);
  assert.deepEqual(rows.map((row: LifeRow): string => row.name), ['Second model', 'First model']);
  assert.deepEqual(rows.map((row: LifeRow): string => row.tag), ['Second', 'First']);
  assert.deepEqual(rows.map((row: LifeRow): number => row.side), [1, 0]);
  assert.deepEqual(rows.map((row: LifeRow): number => row.fraction), [0.25, 1]);
  assert.deepEqual(rows.map((row: LifeRow): string => row.result), ['', '']);
  assert.equal(duelVerdict(rows), null);
});

void test('without a seat in the label the seats keep their order', (): void => {
  const rows: LifeRow[] = duelLives('replay', [seat(10, 100, 'running'), seat(50, 100, 'running')]);
  assert.deepEqual(rows.map((row: LifeRow): string => row.name), ['First model', 'Second model']);
});

void test('life past the bounds or with no maximum stays within the bar', (): void => {
  const rows: LifeRow[] = duelLives('match-first0', [seat(-4, 100, 'died'), seat(140, 100, 'won'), seat(5, 0, 'running')]);
  assert.deepEqual(rows.map((row: LifeRow): number => row.fraction), [0, 1, 0]);
  assert.equal(rows[2]?.name, 'Model 3');
});

void test('the end names the winner, both falling, or the clock', (): void => {
  assert.equal(duelVerdict(duelLives('match-first0', [seat(60, 100, 'won'), seat(0, 100, 'died')])), 'First model wins');
  assert.equal(duelVerdict(duelLives('match-first1', [seat(60, 100, 'won'), seat(0, 100, 'died')])), 'Second model wins');
  assert.equal(duelVerdict(duelLives('match-first0', [seat(0, 100, 'died'), seat(0, 100, 'died')])), 'Both fell');
  assert.equal(duelVerdict(duelLives('match-first0', [seat(40, 100, 'timeout'), seat(70, 100, 'timeout')])), 'No winner, time ran out');
  const ended: LifeRow[] = duelLives('match-first0', [seat(60, 100, 'won'), seat(0, 100, 'died')]);
  assert.deepEqual(ended.map((row: LifeRow): string => row.result), ['Wins', 'Down']);
  assert.deepEqual(ended.map((row: LifeRow): string => row.standing), ['won', 'down']);
  assert.equal(duelVerdict([]), null);
});
