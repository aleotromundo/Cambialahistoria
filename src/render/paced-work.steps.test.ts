import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FramePacer, LatestPaced } from './paced-work.ts';
import { latestPaced, stepPaced } from './paced-work.ts';
import type { Work } from '../../sim/work.ts';

interface StepClock extends FramePacer {
  readonly frames: () => number;
  spend(ms: number): void;
}

function stepClock(): StepClock {
  let clock: number = 0;
  let frames: number = 0;
  return {
    now: (): number => clock,
    next: (): Promise<void> => {
      frames += 1;
      clock += 16;
      return Promise.resolve();
    },
    frames: (): number => frames,
    spend(ms: number): void {
      clock += ms;
    },
  };
}

function* costly(clock: StepClock, steps: number, each: number, seen: number[]): Work {
  for (let step: number = 0; step < steps; step += 1) {
    clock.spend(each);
    seen.push(step);
    yield;
  }
}

void test('a job runs a few steps a frame within its budget until it is done', async (): Promise<void> => {
  const clock: StepClock = stepClock();
  const seen: number[] = [];
  await stepPaced(costly(clock, 10, 1, seen), clock, 3, (): boolean => true);
  assert.equal(seen.length, 10);
  assert.ok(clock.frames() >= 3 && clock.frames() <= 4, `${clock.frames()} frames`);
});

void test('a job no longer wanted stops at the next frame and leaves the rest undone', async (): Promise<void> => {
  const clock: StepClock = stepClock();
  const seen: number[] = [];
  let wanted: boolean = true;
  const stopping = (): boolean => {
    const now: boolean = wanted;
    wanted = false;
    return now;
  };
  await stepPaced(costly(clock, 10, 1, seen), clock, 3, stopping);
  assert.equal(seen.length, 3);
});

void test('a newer job started through the same runner stops the older one at its next frame', async (): Promise<void> => {
  const clock: StepClock = stepClock();
  const older: number[] = [];
  const newer: number[] = [];
  const run: LatestPaced = latestPaced(clock, 3);
  await Promise.all([run(costly(clock, 10, 1, older)), run(costly(clock, 10, 1, newer))]);
  assert.equal(older.length, 3);
  assert.equal(newer.length, 10);
});
