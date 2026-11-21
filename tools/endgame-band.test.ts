import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BandCell, BandMiss, FightResult } from './endgame-band.ts';
import { bandBuilds, bandCell, bandMisses, buildGroup, ENDGAME, fightTime, runBandJob } from './endgame-band.ts';
import type { BuildPolicy } from './simulate-policies.ts';
import { POLICIES } from './simulate-policies.ts';
import { CONTENT } from './simulate-run.ts';

function cell(build: string, time: number, deaths: number): BandCell {
  return { build, fight: 'pack', level: 30, time, deaths, timeouts: 0, runs: 3 };
}

function policy(name: string): BuildPolicy {
  const found: BuildPolicy | undefined = POLICIES.builds.get(name);
  if (found === undefined) throw new Error(`no build ${name}`);
  return found;
}

void test('a fight that is lost or runs out of time counts as the whole time limit', (): void => {
  assert.equal(fightTime({ outcome: 'won', seconds: 12, limit: 120 }), 12);
  assert.equal(fightTime({ outcome: 'lost', seconds: 12, limit: 120 }), 120);
  const results: FightResult[] = [{ outcome: 'won', seconds: 10, limit: 120 }, { outcome: 'lost', seconds: 4, limit: 120 }, { outcome: 'timeout', seconds: 120, limit: 120 }];
  assert.deepEqual(bandCell('a', 'pack', 30, results), { build: 'a', fight: 'pack', level: 30, time: 120, deaths: 1, timeouts: 1, runs: 3 });
});

void test('a build far slower or faster than the median, or dying more often, is outside the band', (): void => {
  const cells: BandCell[] = [cell('a', 10, 0), cell('b', 11, 0), cell('c', 9, 0), cell('d', 30, 0), cell('e', 3, 0), cell('f', 10, 2)];
  const misses: readonly BandMiss[] = bandMisses(cells, 2.5, 0.34);
  assert.deepEqual(misses.map((miss: BandMiss): string => `${miss.cell.build} ${miss.why}`), ['d slow', 'e fast', 'f deaths']);
});

void test('every specialty build fights with the weapon its own lane is drawn for', (): void => {
  const lanes: readonly string[] = bandBuilds(POLICIES).filter((name: string): boolean => name.startsWith(ENDGAME.specialtyPrefix));
  assert.equal(lanes.length, CONTENT.chart.specialties.length);
  for (const name of lanes) {
    const path: string | undefined = CONTENT.chart.specialties.find((entry): boolean => `${ENDGAME.specialtyPrefix}${entry.id}` === name)?.path;
    assert.equal(buildGroup(CONTENT, policy(name))?.path, path, name);
  }
});

void test('every specialty build and archetype clears the standard pack at levels 15 and 30 over three seeds within the band around the median', (): void => {
  const cells: BandCell[] = [];
  for (const level of ENDGAME.levels) {
    for (const build of bandBuilds(POLICIES)) {
      const results: FightResult[] = ENDGAME.seeds.map((seed: number): FightResult => runBandJob(CONTENT, POLICIES, { build, fight: 'pack', level, seed }));
      cells.push(bandCell(build, 'pack', level, results));
    }
  }
  const misses: readonly BandMiss[] = bandMisses(cells, ENDGAME.timeFactor, ENDGAME.deathAllowance);
  assert.deepEqual(misses.map((miss: BandMiss): string => `${miss.cell.build} at level ${miss.cell.level}: ${miss.why}, ${Math.round(miss.cell.time)} s against ${Math.round(miss.median)} s`), []);
});
