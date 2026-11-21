import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { findNode } from '../progression.ts';
import type { Rng } from '../rng.ts';
import { createRng } from '../rng.ts';
import type { Build } from './build.ts';
import { BUILD, buildPoints, buildProblems } from './build.ts';
import { DUEL_KIT } from './kit.ts';
import { barChoices, mutateBuild, orderRoute, randomBuild, treeBuildFor, treeLevel, weaponGroupId } from './tree-build.ts';

const CONTENT: Content = loadContent();
const TOP: number = CONTENT.player.xp.maxLevel;
const SEEDS: readonly number[] = [1, 2, 3, 4];

function levels(): number[] {
  return Array.from({ length: TOP }, (_unused: unknown, index: number): number => index + 1);
}

void test('a random tree build is legal and spends every point at every level', (): void => {
  for (const level of levels()) {
    for (const seed of SEEDS) {
      const build: Build = treeBuildFor(CONTENT, DUEL_KIT, seed, level);
      assert.deepEqual(buildProblems(CONTENT, DUEL_KIT, build, level), [], `seed ${seed} level ${level}`);
      assert.equal(build.route.length, buildPoints(CONTENT, level), `seed ${seed} level ${level}`);
      assert.ok(build.skills.length <= BUILD.slots.length);
    }
  }
});

void test('the same seed and level always draw the same build', (): void => {
  for (const level of [1, 12, 20, TOP]) assert.deepEqual(treeBuildFor(CONTENT, DUEL_KIT, 9, level), treeBuildFor(CONTENT, DUEL_KIT, 9, level));
  assert.notDeepEqual(treeBuildFor(CONTENT, DUEL_KIT, 9, 20), treeBuildFor(CONTENT, DUEL_KIT, 10, 20));
});

void test('builds draw every standard weapon and put skills on the bar when the route unlocks any', (): void => {
  const drawn: Build[] = Array.from({ length: 40 }, (_unused: unknown, seed: number): Build => treeBuildFor(CONTENT, DUEL_KIT, seed, 20));
  assert.deepEqual(new Set(drawn.map((build: Build): string => build.weapon)), new Set(DUEL_KIT.weapons));
  for (const build of drawn) if (barChoices(CONTENT, build.route, 20).length > 0) assert.ok(build.skills.length > 0, build.weapon);
});

void test('a route mostly takes places for the weapon it holds or for any weapon', (): void => {
  let aimed: number = 0;
  let total: number = 0;
  for (let seed: number = 0; seed < 20; seed += 1) {
    const build: Build = randomBuild(CONTENT, DUEL_KIT, createRng(seed), TOP);
    const group: string | null = weaponGroupId(CONTENT, build.weapon);
    for (const id of build.route) {
      const weapon: string | null = findNode(CONTENT, id)?.weapon ?? null;
      total += 1;
      if (weapon === null || weapon === group) aimed += 1;
    }
  }
  assert.ok(aimed / total > 0.5, `${aimed} of ${total}`);
});

void test('a route put back in a joinable order stays legal, and a set that cannot join is refused', (): void => {
  const build: Build = treeBuildFor(CONTENT, DUEL_KIT, 3, 20);
  const ordered: string[] | null = orderRoute(CONTENT, build.route.toReversed());
  assert.ok(ordered !== null);
  assert.deepEqual(buildProblems(CONTENT, DUEL_KIT, { ...build, route: ordered }, 20), []);
  assert.equal(orderRoute(CONTENT, build.route.slice(1).filter((id: string): boolean => findNode(CONTENT, id)?.requires.length !== 0).slice(-1)), null);
});

void test('every mutation of a build stays legal and spends every point', (): void => {
  for (const level of [2, 12, 20, TOP]) {
    for (const seed of SEEDS) {
      const rng: Rng = createRng(seed);
      let build: Build = treeBuildFor(CONTENT, DUEL_KIT, seed, level);
      let changed: number = 0;
      for (let step: number = 0; step < 12; step += 1) {
        const next: Build = mutateBuild(CONTENT, DUEL_KIT, rng, build, level);
        assert.deepEqual(buildProblems(CONTENT, DUEL_KIT, next, level), [], `seed ${seed} level ${level} step ${step}`);
        assert.equal(next.route.length, buildPoints(CONTENT, level));
        if (JSON.stringify(next) !== JSON.stringify(build)) changed += 1;
        build = next;
      }
      assert.ok(changed > 0, `seed ${seed} level ${level}`);
    }
  }
});

void test('a tree-build level follows from the seed, inside the range and the weights', (): void => {
  const range = { min: 1, max: TOP };
  for (let seed: number = 0; seed < 50; seed += 1) {
    const level: number = treeLevel(seed, [], range);
    assert.ok(level >= 1 && level <= TOP);
    assert.equal(treeLevel(seed, [], range), level);
  }
  const top: number[] = levels().map((level: number): number => (level === TOP ? 1 : 0));
  assert.equal(treeLevel(7, top, range), TOP);
});
