import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { World } from '../world/types.ts';
import type { Build } from './build.ts';
import { buildPoints, buildProblems, checkedLevel, levelProblems } from './build.ts';
import { readyBuild } from './build-hero.ts';
import { emptyArena } from './arena.ts';
import { DUEL_KIT } from './kit.ts';

const CONTENT: Content = loadContent();
const SPIN: Build = { name: 'Spin', weapon: 'warden_broadsword', skills: ['thunderhead'], route: ['blade_thunderhead', 'heavy_hands', 'blade_1'], hero: null };

void test('the points a build may spend follow the level it is checked at', (): void => {
  assert.equal(buildPoints(CONTENT, 12), 11 * CONTENT.chart.pointsPerLevel);
  assert.equal(buildPoints(CONTENT, 20), 19 * CONTENT.chart.pointsPerLevel);
});

void test('a route that fits one level can be too long for a lower one', (): void => {
  const long: Build = { ...SPIN, route: Array.from({ length: buildPoints(CONTENT, 2) + 1 }, (_one: unknown, index: number): string => SPIN.route[index] ?? 'blade_1') };
  assert.ok(buildProblems(CONTENT, DUEL_KIT, long, 2).some((problem: string): boolean => /level 2 gives 2/.test(problem)));
  assert.ok(!buildProblems(CONTENT, DUEL_KIT, SPIN, 20).some((problem: string): boolean => /points/.test(problem)));
});

void test('a level outside the experience curve is refused', (): void => {
  const top: number = CONTENT.player.xp.maxLevel;
  assert.deepEqual(levelProblems(CONTENT, top), []);
  assert.match(levelProblems(CONTENT, top + 1).join(), /not a whole number from 1/);
  assert.match(levelProblems(CONTENT, 0).join(), /not a whole number from 1/);
  assert.throws((): number => checkedLevel(CONTENT, 2.5), /level 2\.5/);
  assert.equal(buildProblems(CONTENT, DUEL_KIT, SPIN, top + 1).length > 0, true);
});

void test('a built hero and its gear stand at the level it is readied at', (): void => {
  const world: World = emptyArena(CONTENT, 3, 17);
  readyBuild(world, SPIN, DUEL_KIT, 3, 17);
  assert.equal(world.player.level, 17);
  assert.equal(world.player.equipped.weapon?.level, 17);
  assert.equal(world.player.skillPoints, 0);
});
