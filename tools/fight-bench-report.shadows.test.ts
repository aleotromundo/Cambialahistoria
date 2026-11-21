import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightRaw } from '../src/bench/fight-bench.ts';
import type { ShadowPassReport } from '../src/three-kit/shadow-pass.ts';
import { emptyShadowPassTally, shadowPassReport } from '../src/three-kit/shadow-pass.ts';
import type { FightMeta, FightReport, MetricDelta } from './fight-bench-report.ts';
import { compareReports, fightReport, readReport, readShadowPass, reportLines } from './fight-bench-report.ts';

const META: FightMeta = { plan: 'hall-brawl-v1', zone: 'hall_of_time', commit: 'abc1234', at: '2026-11-21T00:00:00.000Z', load: 3, quiet: true, capped: true, width: 1280, height: 800, scale: 2, warmupMs: 15000, measureMs: 40000 };

const SHADOWS: ShadowPassReport = {
  frames: 100,
  passesPerFrame: 1,
  movedPassShare: 0.9,
  drawsPerFrame: 200,
  trianglesPerFrame: 300000,
  allDrawsPerFrame: 500,
  allTrianglesPerFrame: 1000000,
  kinds: [
    { kind: 'still', drawsPerFrame: 150, trianglesPerFrame: 250000 },
    { kind: 'moved', drawsPerFrame: 10, trianglesPerFrame: 5000 },
    { kind: 'skinned', drawsPerFrame: 35.5, trianglesPerFrame: 40000 },
    { kind: 'instanced', drawsPerFrame: 4.5, trianglesPerFrame: 5000 },
  ],
};

const RAW: FightRaw = { zone: 'hall_of_time', frames: [16, 17], calls: [500, 500], triangles: [1000000, 1000000], longTasks: [], start: { programs: 40, geometries: 300, textures: 80, heapMegabytes: null }, end: { programs: 40, geometries: 300, textures: 80, heapMegabytes: null }, peakLive: 40, kills: 100, hits: 900, drops: 20, casts: 80, heroDeaths: 0, programChanges: { frames: 100, drawsPerFrame: 500, changedDrawsPerFrame: 0, byReason: [], rows: [] }, shadowPass: SHADOWS, problems: [] };

void test('the shadow pass prints its share of the frame, how often its view moved, and the split by caster', (): void => {
  const lines: string[] = reportLines(fightReport(RAW, META));
  const at: number = lines.findIndex((line: string): boolean => line.startsWith('shadows'));
  assert.equal(lines[at], 'shadows    1 passes a frame: 200 of 500 draws (40%), 300000 of 1000000 triangles (30%); view moved in 90% of passes');
  assert.equal(lines[at + 1], '           still 150 draws 250000 tris, moved 10 draws 5000 tris, skinned 35.5 draws 40000 tris, instanced 4.5 draws 5000 tris');
  assert.equal(lines[at - 1]?.startsWith('programs'), true);
});

void test('a report saved before the shadow count reads back with none and compares as unknown', (): void => {
  const report: FightReport = fightReport(RAW, META);
  const old: FightReport = readReport(JSON.parse(JSON.stringify({ ...report, shadowPass: undefined })));
  assert.equal(old.shadowPass, null);
  assert.ok(reportLines(old).every((line: string): boolean => !line.startsWith('shadows')));
  const draws: MetricDelta | undefined = compareReports(old, report).find((delta: MetricDelta): boolean => delta.label === 'shadow draws');
  assert.deepEqual([draws?.before, draws?.after, draws?.delta], [null, 200, null]);
});

void test('a shadow report reads back exactly, an empty one has no share, and an unknown caster kind is refused', (): void => {
  assert.deepEqual(readShadowPass(JSON.parse(JSON.stringify(SHADOWS)), 'shadows'), SHADOWS);
  const empty: FightReport = fightReport({ ...RAW, shadowPass: shadowPassReport(emptyShadowPassTally(), 0) }, META);
  assert.ok(reportLines(empty).some((line: string): boolean => line.includes('0 of 0 draws (-)')));
  assert.throws((): ShadowPassReport => readShadowPass({ ...SHADOWS, kinds: [{ kind: 'floating', drawsPerFrame: 1, trianglesPerFrame: 1 }] }, 'shadows'));
});
