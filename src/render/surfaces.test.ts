import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keptTextureKeys } from './surfaces.ts';

void test('a kept surface keeps every texture loaded for it, even one no cached material lists', (): void => {
  const owned: Map<string, Set<string>> = new Map<string, Set<string>>([
    ['molten', new Set<string>(['molten.webp@4'])],
    ['basalt', new Set<string>(['basalt.webp@2', 'basalt_normal.webp@2'])],
  ]);
  const kept: Set<string> = keptTextureKeys([['stone.webp@3']], owned, new Set<string>(['molten']));
  assert.deepEqual([...kept].toSorted(), ['molten.webp@4', 'stone.webp@3']);
});

void test('a surface no longer kept lets its textures go unless a kept material still lists them', (): void => {
  const owned: Map<string, Set<string>> = new Map<string, Set<string>>([['basalt', new Set<string>(['shared.webp@2', 'basalt.webp@2'])]]);
  const kept: Set<string> = keptTextureKeys([['shared.webp@2']], owned, new Set<string>());
  assert.deepEqual([...kept], ['shared.webp@2']);
});
