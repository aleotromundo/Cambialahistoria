import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { InstancedMesh, Material } from 'three';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, PropDef } from '../../sim/content/types.ts';
import { instancedProp, releaseShoreBatch } from './shore-props.ts';
import type { Placed, ShoreBatch } from './shore-props.ts';

const content: Content = loadContent();
const placed: readonly Placed[] = [{ placed: { prop: 'crag_a', x: 0, z: 0, rotationDegrees: 0, scale: 1 }, scale: 1 }];

function propDef(tint: string | null, height: number): PropDef {
  const def: PropDef | undefined = content.props.get('crag_a');
  if (def === undefined) throw new Error('no crag_a prop');
  return { ...def, surfaces: {}, tint, height };
}

function modelOf(material: MeshStandardMaterial): Group {
  const model: Group = new Group();
  model.add(new Mesh(new BoxGeometry(1, 1, 1), material));
  return model;
}

function materialFreed(material: Material): () => boolean {
  let disposed: boolean = false;
  material.addEventListener('dispose', (): void => {
    disposed = true;
  });
  return (): boolean => disposed;
}

function meshFreed(mesh: InstancedMesh): () => boolean {
  let disposed: boolean = false;
  mesh.addEventListener('dispose', (): void => {
    disposed = true;
  });
  return (): boolean => disposed;
}

void test('releasing a shore prop frees its instance buffer and the tinted and cut materials it made', (): void => {
  const source: MeshStandardMaterial = new MeshStandardMaterial();
  const batch: ShoreBatch = instancedProp(content, propDef('#808080', 40), modelOf(source), placed);
  assert.equal(batch.meshes.length, 1);
  assert.equal(batch.owned.length, 2);
  const meshes: (() => boolean)[] = batch.meshes.map(meshFreed);
  const owned: (() => boolean)[] = batch.owned.map(materialFreed);
  const sourceFreed: () => boolean = materialFreed(source);
  releaseShoreBatch(batch);
  assert.ok(meshes.every((freed: () => boolean): boolean => freed()));
  assert.ok(owned.every((freed: () => boolean): boolean => freed()));
  assert.equal(sourceFreed(), false);
});

void test('a plain shore prop owns no material, so releasing it leaves the look other props share', (): void => {
  const batch: ShoreBatch = instancedProp(content, propDef(null, 0.2), modelOf(new MeshStandardMaterial()), placed);
  assert.equal(batch.owned.length, 0);
  const shared: Material | Material[] | undefined = batch.meshes[0]?.material;
  assert.ok(shared instanceof MeshStandardMaterial);
  const sharedFreed: () => boolean = materialFreed(shared);
  releaseShoreBatch(batch);
  assert.equal(sharedFreed(), false);
});
