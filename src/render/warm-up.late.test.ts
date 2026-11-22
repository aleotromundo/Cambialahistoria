import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Camera, Object3D } from 'three';
import { Mesh, PerspectiveCamera, Scene } from 'three';
import type { Timers } from '../backend/backend.ts';
import type { FramePacer } from './paced-work.ts';
import type { ShaderCompiler } from './warm-up.ts';
import { warmUpWithin } from './warm-up.ts';

interface ManualTimers {
  readonly timers: Timers;
  pending(): number;
  fire(): void;
}

function manualTimers(): ManualTimers {
  const tasks: (() => void)[] = [];
  return {
    timers: {
      after: (_ms: number, task: () => void): (() => void) => {
        tasks.push(task);
        return (): void => {
          const index: number = tasks.indexOf(task);
          if (index >= 0) tasks.splice(index, 1);
        };
      },
    },
    pending: (): number => tasks.length,
    fire: (): void => {
      for (const task of tasks.splice(0, tasks.length)) task();
    },
  };
}

interface Held extends ShaderCompiler {
  readonly drawn: Object3D[];
  finish(): void;
}

function held(): Held {
  const drawn: Object3D[] = [];
  const finishers: (() => void)[] = [];
  return {
    drawn,
    finish: (): void => {
      for (const finish of finishers.splice(0, finishers.length)) finish();
    },
    compileAsync(target: Object3D, _camera: Camera): Promise<Object3D> {
      return new Promise<Object3D>((resolve: (value: Object3D) => void): void => {
        finishers.push((): void => resolve(target));
      });
    },
    drawOnce(target: Object3D): void {
      drawn.push(...target.children);
    },
    initTexture(): void {},
  };
}

function ready(): Held {
  const drawn: Object3D[] = [];
  return {
    drawn,
    finish: (): void => undefined,
    compileAsync: (target: Object3D, _camera: Camera): Promise<Object3D> => Promise.resolve(target),
    drawOnce(target: Object3D): void {
      drawn.push(...target.children);
    },
    initTexture(): void {},
  };
}

const PACER: FramePacer = { now: (): number => 0, next: (): Promise<void> => Promise.resolve() };

function settle(): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    setImmediate(resolve);
  });
}

function tracked(promise: Promise<void>): { settled(): boolean } {
  let done: boolean = false;
  void promise.finally((): void => {
    done = true;
  });
  return { settled: (): boolean => done };
}

interface Arrival {
  readonly promise: Promise<void>;
  arrive(): void;
}

function arrival(): Arrival {
  const waiting: (() => void)[] = [];
  const promise: Promise<void> = new Promise<void>((resolve: () => void): void => {
    waiting.push(resolve);
  });
  return {
    promise,
    arrive: (): void => {
      for (const resolve of waiting) resolve();
    },
  };
}

function never(): Promise<void> {
  return new Promise<void>((): void => undefined);
}

void test('the wait for late pieces running out does not cut the scene warm-up short', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const piece: Mesh = new Mesh();
  scene.add(piece);
  const compiler: Held = held();
  const clock: ManualTimers = manualTimers();
  const watched: { settled(): boolean } = tracked(warmUpWithin(compiler, scene, new PerspectiveCamera(), [], clock.timers, 1, never(), PACER));
  clock.fire();
  await settle();
  assert.equal(watched.settled(), false);
  assert.deepEqual(compiler.drawn, []);
  compiler.finish();
  await settle();
  assert.deepEqual(compiler.drawn, [piece]);
  assert.equal(watched.settled(), true);
  assert.equal(clock.pending(), 0);
});

void test('late pieces that never arrive hold the warm-up only until their wait ends', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const piece: Mesh = new Mesh();
  scene.add(piece);
  const compiler: Held = ready();
  const clock: ManualTimers = manualTimers();
  const watched: { settled(): boolean } = tracked(warmUpWithin(compiler, scene, new PerspectiveCamera(), [], clock.timers, 1, never(), PACER));
  await settle();
  assert.deepEqual(compiler.drawn, [piece]);
  assert.equal(watched.settled(), false);
  assert.equal(clock.pending(), 1);
  clock.fire();
  await settle();
  assert.equal(watched.settled(), true);
});

void test('late pieces that arrive in time are warmed before the warm-up ends', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const piece: Mesh = new Mesh();
  const late: Mesh = new Mesh();
  scene.add(piece);
  const compiler: Held = ready();
  const clock: ManualTimers = manualTimers();
  const later: Arrival = arrival();
  const done: Promise<void> = warmUpWithin(compiler, scene, new PerspectiveCamera(), [], clock.timers, 1, later.promise, PACER);
  await settle();
  assert.deepEqual(compiler.drawn, [piece]);
  scene.add(late);
  later.arrive();
  await done;
  assert.deepEqual(compiler.drawn, [piece, late]);
  assert.equal(clock.pending(), 0);
});
