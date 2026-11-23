import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Object3D } from 'three';
import { Mesh, MeshStandardMaterial, PerspectiveCamera, Scene } from 'three';
import type { Timers } from '../backend/backend.ts';
import type { FramePacer } from './paced-work.ts';
import type { ShaderCompiler } from './warm-up.ts';
import { warmUp, warmUpWithin } from './warm-up.ts';
import { markSeeThrough } from './see-through.ts';

const PACER: FramePacer = { now: (): number => 0, next: (): Promise<void> => Promise.resolve() };
const NO_TIMERS: Timers = { after: (): (() => void) => (): void => undefined };

interface Watcher extends ShaderCompiler {
  readonly seen: boolean[];
}

function watching(material: MeshStandardMaterial): Watcher {
  const seen: boolean[] = [];
  return {
    seen,
    compileAsync(target: Object3D): Promise<Object3D> {
      seen.push(material.transparent);
      return Promise.resolve(target);
    },
    drawOnce(): void {},
    initTexture(): void {},
  };
}

void test('a body that can fade is compiled opaque and see-through, and stays opaque', async (): Promise<void> => {
  const material: MeshStandardMaterial = new MeshStandardMaterial();
  markSeeThrough(material);
  const scene: Scene = new Scene();
  scene.add(new Mesh(undefined, material));
  const compiler: Watcher = watching(material);
  await warmUp(compiler, scene, new PerspectiveCamera(), [], null, PACER);
  assert.deepEqual(compiler.seen, [false, true]);
  assert.equal(material.transparent, false);
});

void test('a body that never fades is compiled once', async (): Promise<void> => {
  const material: MeshStandardMaterial = new MeshStandardMaterial();
  const scene: Scene = new Scene();
  scene.add(new Mesh(undefined, material));
  const compiler: Watcher = watching(material);
  await warmUp(compiler, scene, new PerspectiveCamera(), [], null, PACER);
  assert.deepEqual(compiler.seen, [false]);
});

void test('a warm-up waits for what is still loading and warms it before it ends', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const compiled: Object3D[] = [];
  const compiler: ShaderCompiler = {
    compileAsync(target: Object3D): Promise<Object3D> {
      compiled.push(...target.children);
      return Promise.resolve(target);
    },
    drawOnce(): void {},
    initTexture(): void {},
  };
  const arrivals: (() => void)[] = [];
  const loading: Promise<void> = new Promise<void>((resolve: () => void): void => {
    arrivals.push(resolve);
  });
  let ended: boolean = false;
  const done: Promise<void> = warmUpWithin(compiler, scene, new PerspectiveCamera(), [], NO_TIMERS, 1, loading, PACER);
  void done.finally((): void => {
    ended = true;
  });
  await Promise.resolve();
  const late: Mesh = new Mesh();
  scene.add(late);
  assert.equal(ended, false);
  for (const arrive of arrivals) arrive();
  await done;
  assert.ok(compiled.includes(late));
});

void test('a warm-up ends when what was loading failed', async (): Promise<void> => {
  const compiler: ShaderCompiler = {
    compileAsync: (target: Object3D): Promise<Object3D> => Promise.resolve(target),
    drawOnce(): void {},
    initTexture(): void {},
  };
  await warmUpWithin(compiler, new Scene(), new PerspectiveCamera(), [], NO_TIMERS, 1, Promise.reject(new Error('gone')), PACER);
});
