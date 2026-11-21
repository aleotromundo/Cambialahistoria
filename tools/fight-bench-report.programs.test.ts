import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ProgramChangeReport, ProgramChangeRow } from '../src/three-kit/program-changes.ts';
import type { FightMeta, FightReport, MetricDelta } from './fight-bench-report.ts';
import { compareReports, FIGHT_LIMITS, fightReport, readProgramChanges, readReport, reportLines } from './fight-bench-report.ts';
import type { FightRaw } from '../src/bench/fight-bench.ts';

const META: FightMeta = { plan: 'hall-brawl-v1', zone: 'hall_of_time', commit: 'abc1234', at: '2026-11-21T00:00:00.000Z', load: 3, quiet: true, capped: true, width: 1280, height: 800, scale: 2, warmupMs: 15000, measureMs: 40000 };

function row(index: number): ProgramChangeRow {
  return { reason: 'skinning', material: `MeshStandardMaterial "skin" #${index}`, object: 'SkinnedMesh', surface: 'canvas', perFrame: 1 };
}

const PROGRAMS: ProgramChangeReport = { frames: 2400, drawsPerFrame: 412.25, changedDrawsPerFrame: 6.5, byReason: [{ reason: 'skinning', perFrame: 6 }, { reason: 'fog', perFrame: 0.5 }], rows: Array.from({ length: 12 }, (_unused: unknown, index: number): ProgramChangeRow => row(index)) };

const RAW: FightRaw = { zone: 'hall_of_time', frames: [16, 17], calls: [100, 120], triangles: [1000, 2000], longTasks: [], start: { programs: 40, geometries: 300, textures: 80, heapMegabytes: null }, end: { programs: 40, geometries: 300, textures: 80, heapMegabytes: null }, peakLive: 40, kills: 100, hits: 900, drops: 20, casts: 80, heroDeaths: 0, programChanges: PROGRAMS, problems: [] };

void test('the report keeps the largest program changes only and prints them under the work line', (): void => {
  const report: FightReport = fightReport(RAW, META);
  assert.equal(report.programChanges?.rows.length, FIGHT_LIMITS.programRows);
  const lines: string[] = reportLines(report);
  const at: number = lines.findIndex((line: string): boolean => line.startsWith('programs'));
  assert.equal(lines[at], 'programs   6.5 of 412.25 draws a frame change program (skinning 6, fog 0.5)');
  assert.equal(lines[at - 1]?.startsWith('work'), true);
  assert.equal(lines[at + 1], '           1/frame skinning: MeshStandardMaterial "skin" #0 on SkinnedMesh');
});

void test('a report saved before the meter reads back with no program changes and compares as unknown', (): void => {
  const report: FightReport = fightReport(RAW, META);
  const saved: unknown = JSON.parse(JSON.stringify({ ...report, programChanges: undefined }));
  const old: FightReport = readReport(saved);
  assert.equal(old.programChanges, null);
  assert.ok(reportLines(old).every((line: string): boolean => !line.startsWith('programs')));
  const changes: MetricDelta | undefined = compareReports(old, report).find((delta: MetricDelta): boolean => delta.label === 'program changes');
  assert.deepEqual([changes?.before, changes?.after, changes?.delta], [null, 6.5, null]);
});

void test('program changes read back exactly and an unknown reason or surface is refused', (): void => {
  assert.deepEqual(readProgramChanges(JSON.parse(JSON.stringify(PROGRAMS)), 'programs'), PROGRAMS);
  assert.throws((): ProgramChangeReport => readProgramChanges({ ...PROGRAMS, byReason: [{ reason: 'mood', perFrame: 1 }] }, 'programs'));
  assert.throws((): ProgramChangeReport => readProgramChanges({ ...PROGRAMS, rows: [{ ...row(0), surface: 'screen' }] }, 'programs'));
});
