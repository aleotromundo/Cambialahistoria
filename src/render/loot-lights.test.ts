import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Object3D } from 'three';
import { InstancedMesh } from 'three';
import type { LootLights } from './loot-lights.ts';
import { createLootLights } from './loot-lights.ts';

void test('the warm-up stand-ins are made once, so warming a zone never adds an instance buffer', (): void => {
  const lights: LootLights = createLootLights();
  const first: Object3D[] = lights.standIns();
  const second: Object3D[] = lights.standIns();
  assert.equal(first.length, lights.meshes.length);
  assert.deepEqual(second, first);
  for (const [index, stand] of first.entries()) {
    assert.ok(stand instanceof InstancedMesh);
    assert.equal(stand, second[index]);
    assert.equal(stand.count, 1);
  }
});
