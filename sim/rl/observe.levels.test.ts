import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { armourReduction } from '../stats.ts';
import type { Arena } from './arena.ts';
import { arenaObservation, createArena } from './arena.ts';
import type { Build } from './build.ts';
import { BUILD, readBuild } from './build.ts';
import { RL, SELF_FEATURES } from './contract.ts';

const CONTENT: Content = loadContent();
const FOLDER = 'rl/builds';
const TOP: number = CONTENT.player.xp.maxLevel;

function examples(): Build[] {
  return readdirSync(FOLDER).filter((name: string): boolean => name.endsWith('.json')).toSorted().map((name: string): Build => readBuild(JSON.parse(readFileSync(`${FOLDER}/${name}`, 'utf8')), name));
}

function selfOf(arena: Arena): number[] {
  return Array.from(arenaObservation(arena).obs.subarray(0, SELF_FEATURES.length));
}

function saturated(values: readonly number[]): string[] {
  return values.flatMap((value: number, index: number): string[] => (Math.abs(value) >= RL.clip ? [SELF_FEATURES[index] ?? String(index)] : []));
}

void test('no number a built hero sees of itself reaches the clip at the duel level or the top level', (): void => {
  for (const level of [BUILD.level, TOP]) {
    for (const build of examples()) assert.deepEqual(saturated(selfOf(createArena(CONTENT, { seed: 5, jitter: 0, waves: 1, level, build }))), [], `${build.name} at level ${level}`);
  }
});

void test('no number a bench hero sees of itself reaches the clip at the top level', (): void => {
  for (const seed of [1, 2, 3]) assert.deepEqual(saturated(selfOf(createArena(CONTENT, { seed, jitter: 0, waves: 1, level: TOP }))), [], `seed ${seed}`);
});

void test('armour is seen as the share of a hit it takes away, so it stays under the cap however high it climbs', (): void => {
  const cap: number = CONTENT.player.resistance.armourCap;
  for (const build of examples()) {
    const arena: Arena = createArena(CONTENT, { seed: 6, jitter: 0, waves: 1, level: TOP, build });
    const seen: number | undefined = selfOf(arena)[SELF_FEATURES.indexOf('armour')];
    assert.ok(seen !== undefined && Math.abs(seen - armourReduction(arena.world.player.stats.armour, cap)) < 1e-6);
    assert.ok(seen <= cap);
  }
});
