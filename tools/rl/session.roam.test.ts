import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { PoolOptions } from '../../sim/rl/pool.ts';
import { arenaSeats } from '../../sim/rl/pool.ts';
import { legalPool, readPoolOptions } from './session.ts';

void test('hello reads how many roams and escorts each worker plays', (): void => {
  const options: PoolOptions = readPoolOptions({ seed: 3, envs: 8, duels: 1, roams: 2, escorts: 1 });
  assert.equal(options.roams, 2);
  assert.equal(options.escorts, 1);
  assert.equal(arenaSeats(options), 2);
});

void test('a hello that asks for none leaves them out', (): void => {
  const options: PoolOptions = readPoolOptions({ seed: 3, envs: 8, roams: 0 });
  assert.ok(!('roams' in options));
  assert.ok(!('escorts' in options));
  assert.equal(arenaSeats(options), 8);
});

void test('a checked pool keeps its roams and escorts', (): void => {
  const checked: PoolOptions = legalPool(loadContent(), readPoolOptions({ seed: 3, envs: 8, roams: 2, escorts: 1 }));
  assert.equal(checked.roams, 2);
  assert.equal(checked.escorts, 1);
});

void test('hello refuses a count that is not a number of zero or more', (): void => {
  assert.throws((): PoolOptions => readPoolOptions({ seed: 3, envs: 8, roams: -1 }), /roams/);
  assert.throws((): PoolOptions => readPoolOptions({ seed: 3, envs: 8, escorts: 'two' }), /escorts/);
});
