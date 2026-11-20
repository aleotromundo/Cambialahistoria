import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FramePace } from './frame-pace.ts';
import { createFramePace } from './frame-pace.ts';

function ran(pace: FramePace, ticks: readonly number[]): number[] {
  return ticks.filter((now: number): boolean => pace.due(now));
}

function display(hz: number, seconds: number, jitterMs: number = 0): number[] {
  const ticks: number[] = [];
  for (let index: number = 0; index < hz * seconds; index += 1) ticks.push((index * 1000) / hz + (index % 2 === 0 ? jitterMs : -jitterMs));
  return ticks;
}

void test('with no rate every display frame runs', (): void => {
  const ticks: number[] = display(60, 1);
  assert.deepEqual(ran(createFramePace(null), ticks), ticks);
});

void test('a 30 cap runs every other frame of a 60 Hz display at an even step', (): void => {
  const kept: number[] = ran(createFramePace(30), display(60, 2, 1.5));
  assert.ok(kept.length >= 59 && kept.length <= 61);
  for (let index: number = 1; index < kept.length; index += 1) {
    const step: number = (kept[index] ?? 0) - (kept[index - 1] ?? 0);
    assert.ok(step > 30 && step < 37, `step ${step}`);
  }
});

void test('a 30 cap holds an even step when display callbacks arrive unevenly within each refresh', (): void => {
  const ticks: number[] = [];
  let at: number = 0;
  for (let index: number = 0; index < 240; index += 1) {
    at += index % 2 === 0 ? 13 : 20.3;
    ticks.push(at + (index % 5 === 0 ? -3.5 : 0));
  }
  const kept: number[] = ran(createFramePace(30), ticks);
  for (let index: number = 1; index < kept.length; index += 1) {
    const step: number = (kept[index] ?? 0) - (kept[index - 1] ?? 0);
    assert.ok(step > 25 && step < 40, `step ${step}`);
  }
});

void test('a 30 cap runs every fourth frame of a 120 Hz display', (): void => {
  const kept: number[] = ran(createFramePace(30), display(120, 2));
  assert.ok(kept.length >= 59 && kept.length <= 61);
});

void test('a frame that arrives late runs and the pace starts again from it', (): void => {
  const pace: FramePace = createFramePace(30);
  assert.equal(pace.due(0), true);
  assert.equal(pace.due(250), true);
  assert.equal(pace.due(266), false);
  assert.equal(pace.due(283), true);
});

void test('a frame that runs a little late does not let the next display frame run straight after it', (): void => {
  const ticks: number[] = display(60, 2).filter((_now: number, index: number): boolean => index !== 2);
  const kept: number[] = ran(createFramePace(30), ticks);
  for (let index: number = 1; index < kept.length; index += 1) {
    const step: number = (kept[index] ?? 0) - (kept[index - 1] ?? 0);
    assert.ok(step > 25, `step ${step}`);
  }
});

void test('changing the rate takes effect on the next frame', (): void => {
  const pace: FramePace = createFramePace(30);
  assert.equal(pace.due(0), true);
  assert.equal(pace.due(16.7), false);
  pace.setRate(null);
  assert.equal(pace.due(33.4), true);
  assert.equal(pace.due(50), true);
  pace.setRate(30);
  assert.equal(pace.due(66.7), true);
  assert.equal(pace.due(83.4), false);
});
