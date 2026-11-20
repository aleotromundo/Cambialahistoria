import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FramePacer } from './paced-work.ts';
import { heldWhile } from './paced-work.ts';

interface CountingPacer extends FramePacer {
  frames(): number;
}

function countingPacer(): CountingPacer {
  let frame: number = 0;
  return {
    frames: (): number => frame,
    now: (): number => frame * 16,
    next(): Promise<void> {
      frame += 1;
      return Promise.resolve();
    },
  };
}

void test('a held pacer gives one frame when nothing holds it', async (): Promise<void> => {
  const pacer: CountingPacer = countingPacer();
  await heldWhile(pacer, (): boolean => false).next();
  assert.equal(pacer.frames(), 1);
});

void test('a held pacer waits out every frame it is held', async (): Promise<void> => {
  const pacer: CountingPacer = countingPacer();
  await heldWhile(pacer, (): boolean => pacer.frames() < 5).next();
  assert.equal(pacer.frames(), 5);
});

void test('a held pacer reads the time of the pacer it holds', (): void => {
  const pacer: CountingPacer = countingPacer();
  assert.equal(heldWhile(pacer, (): boolean => true).now(), pacer.now());
});
