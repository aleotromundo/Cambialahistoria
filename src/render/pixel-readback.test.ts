import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FramePacer } from './paced-work.ts';
import type { ReadbackGl } from './pixel-readback.ts';
import { READBACK, readPixelsLater, straightRows } from './pixel-readback.ts';

interface FakeGl extends ReadbackGl {
  readonly calls: string[];
  readonly live: () => number;
}

const STATUS = { signaled: 0x911a, satisfied: 0x911c, expired: 0x911b, failed: 0x911d } as const;

function fakeGl(signalAfter: number, failing: boolean, source: Uint8Array): FakeGl {
  const calls: string[] = [];
  let polls: number = 0;
  let live: number = 0;
  return {
    PIXEL_PACK_BUFFER: 0x88eb,
    STREAM_READ: 0x88e1,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
    ALREADY_SIGNALED: STATUS.signaled,
    CONDITION_SATISFIED: STATUS.satisfied,
    WAIT_FAILED: STATUS.failed,
    calls,
    live: (): number => live,
    createBuffer: (): WebGLBuffer => {
      live += 1;
      return {};
    },
    deleteBuffer: (): void => {
      live -= 1;
    },
    bindBuffer: (): void => undefined,
    bufferData: (): void => undefined,
    readPixels: (x: number, y: number, width: number, height: number): void => {
      calls.push(`read ${x} ${y} ${width} ${height}`);
    },
    getBufferSubData: (_target: number, _offset: number, into: ArrayBufferView): void => {
      calls.push('copy');
      new Uint8Array(into.buffer).set(source);
    },
    fenceSync: (): WebGLSync => ({}),
    clientWaitSync: (): number => {
      polls += 1;
      calls.push('poll');
      if (failing) return STATUS.failed;
      return polls > signalAfter ? STATUS.satisfied : STATUS.expired;
    },
    deleteSync: (): void => {
      calls.push('drop sync');
    },
    flush: (): void => {
      calls.push('flush');
    },
  };
}

interface CountingPacer extends FramePacer {
  readonly frames: () => number;
}

function countingPacer(): CountingPacer {
  let frames: number = 0;
  return {
    now: (): number => frames * 16,
    next: (): Promise<void> => {
      frames += 1;
      return Promise.resolve();
    },
    frames: (): number => frames,
  };
}

void test('pixels are read once the GPU has finished, a frame at a time, without waiting on it', async (): Promise<void> => {
  const source: Uint8Array = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
  const gl: FakeGl = fakeGl(3, false, source);
  const pacer: CountingPacer = countingPacer();
  const pixels: Uint8Array | null = await readPixelsLater(gl, { x: 0, y: 0, width: 2, height: 1 }, pacer);
  assert.deepEqual(pixels, source);
  assert.equal(pacer.frames(), 3);
  assert.deepEqual(gl.calls.slice(0, 2), ['read 0 0 2 1', 'flush']);
  assert.equal(gl.calls.filter((call: string): boolean => call === 'copy').length, 1);
  assert.equal(gl.live(), 0);
});

void test('a lost context or a fence that never signals gives no pixels and frees the buffer', async (): Promise<void> => {
  const failed: FakeGl = fakeGl(0, true, new Uint8Array(4));
  assert.equal(await readPixelsLater(failed, { x: 0, y: 0, width: 1, height: 1 }, countingPacer()), null);
  assert.equal(failed.live(), 0);
  const stuck: FakeGl = fakeGl(Infinity, false, new Uint8Array(4));
  const pacer: CountingPacer = countingPacer();
  assert.equal(await readPixelsLater(stuck, { x: 0, y: 0, width: 1, height: 1 }, pacer), null);
  assert.equal(pacer.frames(), READBACK.maxFrames);
  assert.equal(stuck.live(), 0);
});

void test('rows read bottom first come out top first, with colour no longer multiplied by alpha', (): void => {
  const bottomUp: Uint8Array = Uint8Array.from([10, 20, 30, 255, 64, 32, 0, 128, 0, 0, 0, 0, 50, 50, 50, 255]);
  assert.deepEqual([...straightRows(bottomUp, 2, 2)], [0, 0, 0, 0, 50, 50, 50, 255, 10, 20, 30, 255, 128, 64, 0, 128]);
});
