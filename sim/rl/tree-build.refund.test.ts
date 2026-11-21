import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { Rng } from '../rng.ts';
import { createRng } from '../rng.ts';
import type { Build } from './build.ts';
import { buildPoints, buildProblems } from './build.ts';
import { DUEL_KIT } from './kit.ts';
import { mutateBuild, treeBuildFor } from './tree-build.ts';

const CONTENT: Content = loadContent();

void test('a place mutation on a route with points to spare never takes back the place it refunded', (): void => {
  let checked: number = 0;
  for (let seed: number = 0; seed < 12; seed += 1) {
    const full: Build = treeBuildFor(CONTENT, DUEL_KIT, seed, 20);
    const short: Build = { ...full, route: full.route.slice(0, Math.floor(full.route.length / 2)), skills: [] };
    const rng: Rng = createRng(seed);
    for (let step: number = 0; step < 6; step += 1) {
      const next: Build = mutateBuild(CONTENT, DUEL_KIT, rng, short, 20);
      assert.deepEqual(buildProblems(CONTENT, DUEL_KIT, next, 20), []);
      if (next.route.length === short.route.length) continue;
      checked += 1;
      assert.equal(next.route.length, buildPoints(CONTENT, 20));
      assert.ok(short.route.some((id: string): boolean => !next.route.includes(id)), `seed ${seed} step ${step}`);
    }
  }
  assert.ok(checked > 0);
});
