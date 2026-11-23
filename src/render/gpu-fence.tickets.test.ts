import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FenceContext, GpuQueue } from './gpu-fence.ts';
import { createGpuQueue } from './gpu-fence.ts';

interface FakeFences extends FenceContext {
  finish(count: number): void;
  lose(): void;
  refuse(): void;
}

function fakeFences(): FakeFences {
  const signalled: Set<WebGLSync> = new Set<WebGLSync>();
  const placed: WebGLSync[] = [];
  let lost: boolean = false;
  let refused: boolean = false;
  return {
    SYNC_GPU_COMMANDS_COMPLETE: 1,
    SYNC_STATUS: 2,
    SIGNALED: 3,
    UNSIGNALED: 4,
    isContextLost: (): boolean => lost,
    fenceSync(): WebGLSync | null {
      if (refused) return null;
      const sync: WebGLSync = {};
      placed.push(sync);
      return sync;
    },
    getSyncParameter: (sync: WebGLSync): number => (signalled.has(sync) ? 3 : 4),
    deleteSync(): void {},
    flush(): void {},
    finish(count: number): void {
      for (const sync of placed.splice(0, count)) signalled.add(sync);
    },
    lose(): void {
      lost = true;
    },
    refuse(): void {
      refused = true;
    },
  };
}

void test('a ticket is finished once its own fence is, while later fences are still open', (): void => {
  const gl: FakeFences = fakeFences();
  const queue: GpuQueue = createGpuQueue(gl);
  const first: number = queue.mark();
  const second: number = queue.mark();
  assert.equal(queue.finished(first), false);
  gl.finish(1);
  assert.equal(queue.finished(first), true);
  assert.equal(queue.finished(second), false);
  assert.equal(queue.waiting(), 1);
});

void test('every ticket is finished on a lost context', (): void => {
  const gl: FakeFences = fakeFences();
  const queue: GpuQueue = createGpuQueue(gl);
  const ticket: number = queue.mark();
  gl.lose();
  assert.equal(queue.finished(ticket), true);
});

void test('a fence the context refuses is finished at once, though an earlier fence is still open', (): void => {
  const gl: FakeFences = fakeFences();
  const queue: GpuQueue = createGpuQueue(gl);
  const open: number = queue.mark();
  gl.refuse();
  const refused: number = queue.mark();
  assert.equal(queue.finished(refused), true);
  assert.equal(queue.finished(open), false);
  assert.equal(queue.waiting(), 1);
});

void test('without fences a ticket is finished at once', (): void => {
  const queue: GpuQueue = createGpuQueue(null);
  assert.equal(queue.finished(queue.mark()), true);
});
