import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Object3D } from 'three';
import { Mesh, MeshStandardMaterial, PerspectiveCamera, Scene } from 'three';
import type { FramePacer } from './paced-work.ts';
import type { ShaderCompiler } from './warm-up.ts';
import { warmUp } from './warm-up.ts';
import { markSeeThrough } from './see-through.ts';

const PACER: FramePacer = { now: (): number => 0, next: (): Promise<void> => Promise.resolve() };

interface DrawWatcher extends ShaderCompiler {
  readonly drawn: boolean[];
}

function watchingDraws(material: MeshStandardMaterial): DrawWatcher {
  const drawn: boolean[] = [];
  return {
    drawn,
    compileAsync(target: Object3D): Promise<Object3D> {
      return Promise.resolve(target);
    },
    drawOnce(): void {
      drawn.push(material.transparent);
    },
    initTexture(): void {},
  };
}

void test('a body that can fade is drawn once opaque and once see-through while it warms, and stays opaque', async (): Promise<void> => {
  const material: MeshStandardMaterial = new MeshStandardMaterial();
  markSeeThrough(material);
  const scene: Scene = new Scene();
  scene.add(new Mesh(undefined, material));
  const compiler: DrawWatcher = watchingDraws(material);
  await warmUp(compiler, scene, new PerspectiveCamera(), [], null, PACER);
  assert.deepEqual(compiler.drawn, [false, true]);
  assert.equal(material.transparent, false);
});

void test('a body that never fades is drawn once while it warms', async (): Promise<void> => {
  const material: MeshStandardMaterial = new MeshStandardMaterial();
  const scene: Scene = new Scene();
  scene.add(new Mesh(undefined, material));
  const compiler: DrawWatcher = watchingDraws(material);
  await warmUp(compiler, scene, new PerspectiveCamera(), [], null, PACER);
  assert.deepEqual(compiler.drawn, [false]);
});
