import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SoakSample, SoakVerdict } from './soak-report.ts';
import { judgeSoak, readSample, slope, SOAK, SOAK_LIMITS, soakArgs } from './soak-report.ts';

function lap(index: number, overrides: Partial<SoakSample> = {}): SoakSample {
  return { lap: index, ms: 180_000, heapMb: 120, gpuMb: 65, textures: 140, geometries: 900, programs: 60, nodes: 4000, listeners: 600, ...overrides };
}

function laps(count: number, shape: (index: number) => Partial<SoakSample>): SoakSample[] {
  return Array.from({ length: count }, (_unused: unknown, index: number): SoakSample => lap(index + 1, shape(index)));
}

void test('the slope is the least-squares growth a lap', (): void => {
  assert.equal(slope([]), 0);
  assert.equal(slope([5]), 0);
  assert.equal(slope([1, 2, 3, 4]), 1);
  assert.equal(slope([10, 10, 10]), 0);
  assert.equal(slope([4, 3, 2]), -1);
  assert.ok(Math.abs(slope([100, 102, 99, 101, 100]) - -0.1) < 1e-9);
});

void test('a flat soak passes, and the first lap may fill caches without counting as growth', (): void => {
  const verdict: SoakVerdict = judgeSoak(laps(SOAK.laps, (index: number): Partial<SoakSample> => (index === 0 ? { heapMb: 60, textures: 90 } : { heapMb: 120 + (index % 2) })));
  assert.deepEqual(verdict.problems, []);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.lines.length, SOAK.laps + 7);
});

void test('memory that climbs every lap fails and names what climbs', (): void => {
  const verdict: SoakVerdict = judgeSoak(laps(SOAK.laps, (index: number): Partial<SoakSample> => ({ heapMb: 120 + index * 5, textures: 140 + index * 3 })));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.problems.length, 2);
  assert.match(verdict.problems[0] ?? '', /^JS heap MB grow by 5 a lap/);
  assert.match(verdict.problems[1] ?? '', /^live textures grow by 3 a lap/);
});

void test('a peak over the budget fails even when it does not grow', (): void => {
  const verdict: SoakVerdict = judgeSoak(laps(SOAK.laps, (): Partial<SoakSample> => ({ gpuMb: SOAK_LIMITS.gpuMb + 1 })));
  assert.deepEqual(verdict.problems, [`GPU MB peak at ${SOAK_LIMITS.gpuMb + 1}, over the ${SOAK_LIMITS.gpuMb} budget`]);
});

void test('too few laps cannot tell growth from noise', (): void => {
  const verdict: SoakVerdict = judgeSoak(laps(SOAK.warmLaps + SOAK.leastLaps - 1, (): Partial<SoakSample> => ({})));
  assert.equal(verdict.ok, false);
  assert.match(verdict.problems[0] ?? '', /a soak needs at least/);
});

void test('a sample is read from the page memory report and the page metrics', (): void => {
  const taken: SoakSample = readSample(2, 1000, { gpuMegabytes: 310.5, liveTextures: 141, liveGeometries: 905, programs: 61, heapMegabytes: null }, { Nodes: 4100, JSEventListeners: 610, Documents: 2 }, 3 * SOAK.megabyte);
  assert.deepEqual(taken, { lap: 2, ms: 1000, heapMb: 3, gpuMb: 310.5, textures: 141, geometries: 905, programs: 61, nodes: 4100, listeners: 610 });
  assert.throws((): SoakSample => readSample(1, 0, { gpuMegabytes: 'lots' }, {}, 0));
});

void test('the arguments default to a phone soak and are checked', (): void => {
  assert.deepEqual(soakArgs([], {}), { url: null, chrome: SOAK.chrome, port: SOAK.port, laps: SOAK.laps, hero: SOAK.hero, out: null });
  assert.deepEqual(soakArgs(['--laps', '5', '--port', '6000', '--url', 'http://localhost:6000', '--hero', 'man', '--out', 'soak.json'], { CHROME_PATH: '/usr/bin/chrome' }), { url: 'http://localhost:6000', chrome: '/usr/bin/chrome', port: 6000, laps: 5, hero: 'man', out: 'soak.json' });
  assert.throws((): unknown => soakArgs(['--laps', '2'], {}), /at least 4/);
  assert.throws((): unknown => soakArgs(['--laps'], {}), /needs a value/);
});
