import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixedRivalSeed, rivalSeedSource } from './rival-seed.ts';

void test('a dev page can pin the rival to one seed, so every duel of a soak is the same duel', (): void => {
  assert.equal(fixedRivalSeed('?quality=mobile&rivalSeed=7', true), 7);
  assert.equal(fixedRivalSeed('?rivalSeed=0', true), 0);
});

void test('a shipped page, a missing seed or a bad seed leaves the rival random', (): void => {
  assert.equal(fixedRivalSeed('?rivalSeed=7', false), null);
  assert.equal(fixedRivalSeed('?quality=mobile', true), null);
  assert.equal(fixedRivalSeed('?rivalSeed=-1', true), null);
  assert.equal(fixedRivalSeed('?rivalSeed=abc', true), null);
  assert.equal(fixedRivalSeed('?rivalSeed=', true), null);
});

void test('the seed source repeats a pinned seed and otherwise draws a whole number from the random source', (): void => {
  const pinned: () => number = rivalSeedSource('?rivalSeed=7', true, (): number => 0.5);
  assert.equal(pinned(), 7);
  assert.equal(pinned(), 7);
  assert.equal(rivalSeedSource('', true, (): number => 0.5)(), 1073741823);
  assert.equal(rivalSeedSource('?rivalSeed=7', false, (): number => 0)(), 0);
});
