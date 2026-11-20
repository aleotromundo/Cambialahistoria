import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Material } from 'three';
import { Group, Mesh, MeshStandardMaterial } from 'three';
import { asSeeThrough, canSeeThrough, markSeeThrough, opaqueSwitchables } from './see-through.ts';

void test('only a marked material can go see-through', (): void => {
  const marked: MeshStandardMaterial = new MeshStandardMaterial();
  const plain: MeshStandardMaterial = new MeshStandardMaterial();
  markSeeThrough(marked);
  assert.equal(canSeeThrough(marked), true);
  assert.equal(canSeeThrough(plain), false);
});

void test('a mesh offers each of its marked opaque materials once', (): void => {
  const marked: MeshStandardMaterial = new MeshStandardMaterial();
  const clear: MeshStandardMaterial = new MeshStandardMaterial({ transparent: true });
  const plain: MeshStandardMaterial = new MeshStandardMaterial();
  markSeeThrough(marked);
  markSeeThrough(clear);
  const mesh: Mesh = new Mesh(undefined, [marked, clear, plain, marked]);
  assert.deepEqual(opaqueSwitchables(mesh), [marked]);
  assert.deepEqual(opaqueSwitchables(new Group()), []);
});

void test('work done see-through finds the materials see-through and leaves them opaque', (): void => {
  const material: MeshStandardMaterial = new MeshStandardMaterial();
  const before: number = material.version;
  const seen: boolean = asSeeThrough([material], (): boolean => material.transparent);
  assert.equal(seen, true);
  assert.equal(material.transparent, false);
  assert.ok(material.version > before);
});

void test('materials are opaque again when the see-through work throws', (): void => {
  const material: Material = new MeshStandardMaterial();
  assert.throws((): void =>
    asSeeThrough([material], (): void => {
      throw new Error('compile failed');
    }),
  );
  assert.equal(material.transparent, false);
});
