import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { Build } from './build.ts';
import type { Match, Pool, PoolOptions } from './pool.ts';
import { createPool, matchLevel, matchWorld } from './pool.ts';

const CONTENT: Content = loadContent();
const SPIN: Build = { name: 'Spin', weapon: 'warden_broadsword', skills: ['thunderhead'], route: ['blade_thunderhead', 'heavy_hands', 'blade_1'], hero: null };
const BASE: PoolOptions = { seed: 31, envs: 8, duels: 2, jitter: 0, waves: 1, keepEvery: 0, levels: [] };

function levelOf(match: Match): number {
  return matchLevel(match);
}

void test('a pool with a level range plays its arenas and duels inside it', (): void => {
  const pool: Pool = createPool(CONTENT, { ...BASE, range: { min: 18, max: 20 } });
  for (const match of pool.matches) {
    const level: number = levelOf(match);
    assert.ok(level >= 18 && level <= 20, `level ${level}`);
    const hero = matchWorld(match).player;
    assert.equal(hero.level, level);
  }
});

void test('a pool with a build plays it at its build level in arenas and duels', (): void => {
  const pool: Pool = createPool(CONTENT, { ...BASE, build: SPIN, buildLevel: 15 });
  for (const match of pool.matches) {
    assert.equal(levelOf(match), 15);
    const hero = matchWorld(match).player;
    assert.equal(hero.level, 15);
    assert.deepEqual(hero.allocated, SPIN.route);
  }
});

void test('bench duels take their level from the range, never from the build level, even when every seat is named empty', (): void => {
  for (const extra of [{ buildLevel: 30 }, { buildLevel: 30, seats: [null, null] }, { buildLevel: 30, build: SPIN, seats: [null, null] }]) {
    const pool: Pool = createPool(CONTENT, { ...BASE, range: { min: 18, max: 20 }, ...extra });
    for (const match of pool.matches) if (match.kind === 'duel') assert.ok(match.duel.level >= 18 && match.duel.level <= 20, `level ${match.duel.level}`);
  }
});
