import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { createRng } from '../rng.ts';
import type { Build } from './build.ts';
import { BUILD, buildPoints, buildProblems } from './build.ts';
import { DUEL_KIT } from './kit.ts';
import { joinable, rivalBuild } from './rival-build.ts';

const CONTENT: Content = loadContent();
const LEVELS: readonly number[] = [1, 2, 5, 12, 20, 30];
const SEEDS: readonly number[] = [1, 2, 3];

void test('every rival build is legal at its level, spends what the tree allows and wears a standard weapon', (): void => {
  for (const level of LEVELS) {
    for (const seed of SEEDS) {
      const build: Build = rivalBuild(CONTENT, DUEL_KIT, createRng(seed * 1000 + level), level);
      assert.deepEqual(buildProblems(CONTENT, DUEL_KIT, build, level), [], `level ${level} seed ${seed}`);
      assert.ok(build.route.length === buildPoints(CONTENT, level) || joinable(CONTENT, build.route).length === 0, `level ${level} seed ${seed} left points unspent`);
      assert.ok(DUEL_KIT.weapons.includes(build.weapon));
      assert.ok(build.skills.length <= BUILD.slots.length);
    }
  }
});

void test('a rival build carries skills once there are any to carry', (): void => {
  const build: Build = rivalBuild(CONTENT, DUEL_KIT, createRng(9), 20);
  assert.ok(build.skills.length > 0);
});

void test('the same seed draws the same build', (): void => {
  assert.deepEqual(rivalBuild(CONTENT, DUEL_KIT, createRng(77), 15), rivalBuild(CONTENT, DUEL_KIT, createRng(77), 15));
  assert.notDeepEqual(rivalBuild(CONTENT, DUEL_KIT, createRng(77), 15), rivalBuild(CONTENT, DUEL_KIT, createRng(78), 15));
});
