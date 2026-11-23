import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FramePacer, GpuWork } from './paced-work.ts';
import { gpuPaced } from './paced-work.ts';

interface CountingPacer extends FramePacer {
  frames(): number;
}

const FRAME_MS: number = 16;

function countingPacer(): CountingPacer {
  let frame: number = 0;
  return {
    frames: (): number => frame,
    now: (): number => frame * FRAME_MS,
    next(): Promise<void> {
      frame += 1;
      return Promise.resolve();
    },
  };
}

interface FakeGpu extends GpuWork {
  marks(): number;
}

function fakeGpu(busyUntilFrame: number, pacer: CountingPacer): FakeGpu {
  let marks: number = 0;
  return {
    marks: (): number => marks,
    mark(): number {
      marks += 1;
      return marks;
    },
    finished: (): boolean => pacer.frames() >= busyUntilFrame,
  };
}

void test('a GPU-paced step marks what was sent and takes one frame when the GPU has finished it', async (): Promise<void> => {
  const pacer: CountingPacer = countingPacer();
  const gpu: FakeGpu = fakeGpu(0, pacer);
  await gpuPaced(pacer, gpu).next();
  assert.equal(gpu.marks(), 1);
  assert.equal(pacer.frames(), 1);
});

void test('a GPU-paced step waits out every frame the GPU is still working on what was sent', async (): Promise<void> => {
  const pacer: CountingPacer = countingPacer();
  const gpu: FakeGpu = fakeGpu(7, pacer);
  await gpuPaced(pacer, gpu).next();
  assert.equal(pacer.frames(), 7);
});

void test('a GPU-paced step stops waiting once its hold has passed', async (): Promise<void> => {
  const pacer: CountingPacer = countingPacer();
  const gpu: FakeGpu = fakeGpu(Number.POSITIVE_INFINITY, pacer);
  await gpuPaced(pacer, gpu, FRAME_MS * 4).next();
  assert.equal(pacer.frames(), 4);
});

void test('a GPU-paced pacer reads the time of the pacer it holds', (): void => {
  const pacer: CountingPacer = countingPacer();
  assert.equal(gpuPaced(pacer, fakeGpu(0, pacer)).now(), pacer.now());
});

void test('a GPU-paced step waits only for what it sent, however much another warm-up sends after it', async (): Promise<void> => {
  const pacer: CountingPacer = countingPacer();
  let sent: number = 0;
  const gpu: GpuWork = {
    mark(): number {
      sent += 1;
      return sent;
    },
    finished: (ticket: number): boolean => pacer.frames() >= ticket,
  };
  const step: Promise<void> = gpuPaced(pacer, gpu).next();
  gpu.mark();
  gpu.mark();
  await step;
  assert.equal(pacer.frames(), 1);
});
