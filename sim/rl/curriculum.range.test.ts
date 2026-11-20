import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '../rng.ts';
import type { Rng } from '../rng.ts';
import { ARENA } from './arena.ts';
import type { LevelRange } from './curriculum.ts';
import { levelCount, levelIn, rangeProblems, readLevelRange, readLevelWeights } from './curriculum.ts';

const WIDE: LevelRange = { min: 1, max: 20 };

void test('a level range defaults to the arena levels and is read as two whole levels, lowest first', (): void => {
  assert.deepEqual(readLevelRange(undefined), ARENA.levels);
  assert.deepEqual(readLevelRange({ min: 1, max: 20 }), WIDE);
  for (const bad of [{ min: 0, max: 5 }, { min: 6, max: 5 }, { min: 1.5, max: 5 }, { min: 1 }, [1, 20], 'high']) assert.throws((): LevelRange => readLevelRange(bad), /level range/);
});

void test('a range past the top level is a problem', (): void => {
  assert.deepEqual(rangeProblems(WIDE, 30), []);
  assert.match(rangeProblems({ min: 1, max: 31 }, 30).join(), /past the top level 30/);
});

void test('level weights name every level of the range they belong to', (): void => {
  assert.equal(levelCount(WIDE), 20);
  const even: number[] = Array.from({ length: 20 }, (): number => 1);
  assert.deepEqual(readLevelWeights(even, WIDE), even);
  assert.throws((): number[] => readLevelWeights(even), /all 12 levels from 1 to 12/);
});

void test('a wider range with no weights draws every level in it, and the arena range leaves the level to the arena', (): void => {
  const rng: Rng = createRng(4);
  const drawn: Set<number> = new Set<number>();
  for (let draw: number = 0; draw < 400; draw += 1) drawn.add(levelIn(rng, [], WIDE) ?? 0);
  assert.deepEqual([...drawn].toSorted((a: number, b: number): number => a - b), Array.from({ length: 20 }, (_one: unknown, index: number): number => index + 1));
  assert.equal(levelIn(rng, [], ARENA.levels), null);
});

void test('weights over a wider range pick levels from its own bottom', (): void => {
  const range: LevelRange = { min: 13, max: 20 };
  const weights: number[] = Array.from({ length: levelCount(range) }, (_one: unknown, index: number): number => (index === 7 ? 1 : 0));
  assert.equal(levelIn(createRng(9), weights, range), 20);
});
