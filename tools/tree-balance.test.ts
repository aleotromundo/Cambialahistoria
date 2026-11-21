import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DUEL_KIT } from '../sim/rl/kit.ts';
import { buildPoints } from '../sim/rl/build.ts';
import type { ScoredBuild } from '../sim/tree-best.ts';
import { POLICIES } from './simulate-policies.ts';
import { CONTENT } from './simulate-run.ts';
import type { LiftedBuild } from './tree-balance.ts';
import { aheadOfBand, BALANCE, bestBuilds, medianLift, specialtyBuilds } from './tree-balance.ts';

function lifted(name: string, lift: number): LiftedBuild {
  const build: ScoredBuild = { weapon: 'w', route: [], score: lift, damage: lift, toughness: 1, lead: null };
  return { name, build, lift };
}

void test('a best build is ahead of the band when its lift passes the share of the median specialty lift', (): void => {
  const lanes: LiftedBuild[] = [lifted('a', 3), lifted('b', 4), lifted('c', 5)];
  assert.equal(medianLift(lanes), 4);
  assert.deepEqual(aheadOfBand([lifted('x', 7.9), lifted('y', 8.1)], 4, 2).map((entry: LiftedBuild): string => entry.name), ['y']);
});

void test('no level-30 allocation for any standard weapon lifts the hero far past the median specialty build', (): void => {
  const lanes: readonly LiftedBuild[] = specialtyBuilds(CONTENT, DUEL_KIT, POLICIES, BALANCE.level);
  assert.equal(lanes.length, CONTENT.chart.specialties.length);
  for (const lane of lanes) assert.equal(lane.build.route.length, buildPoints(CONTENT, BALANCE.level), lane.name);
  const median: number = medianLift(lanes);
  const best: readonly LiftedBuild[] = bestBuilds(CONTENT, DUEL_KIT, BALANCE.level, lanes);
  const ahead: readonly LiftedBuild[] = aheadOfBand(best, median, BALANCE.share);
  assert.deepEqual(ahead.map((entry: LiftedBuild): string => `${entry.name} lifts ${Math.round(entry.lift * 100) / 100}, past ${Math.round(median * BALANCE.share * 100) / 100}, through ${entry.build.route.join(', ')}`), []);
});
