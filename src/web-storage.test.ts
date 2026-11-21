import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { KeyValueStore } from './backend/backend.ts';
import { createWebStore } from './web-storage.ts';
import type { WebStorage } from './web-storage.ts';

function memory(): WebStorage & { readonly entries: Map<string, string> } {
  const entries: Map<string, string> = new Map<string, string>();
  return {
    entries,
    getItem: (key: string): string | null => entries.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      entries.set(key, value);
    },
    removeItem: (key: string): void => {
      entries.delete(key);
    },
  };
}

function refusing(): WebStorage {
  return {
    getItem: (): string | null => {
      throw new Error('blocked');
    },
    setItem: (): void => {
      throw new Error('full');
    },
    removeItem: (): void => {
      throw new Error('blocked');
    },
  };
}

void test('a web store reads, writes and removes through the storage it is given', (): void => {
  const backing = memory();
  const store: KeyValueStore = createWebStore((): WebStorage => backing);
  assert.equal(store.read('a'), null);
  assert.equal(store.write('a', '1'), true);
  assert.equal(store.read('a'), '1');
  store.remove('a');
  assert.equal(backing.entries.size, 0);
});

void test('a storage that throws reads as empty, refuses the write and ignores the removal', (): void => {
  const store: KeyValueStore = createWebStore(refusing);
  assert.equal(store.read('a'), null);
  assert.equal(store.write('a', '1'), false);
  assert.doesNotThrow((): void => store.remove('a'));
});

void test('a storage that cannot even be reached counts as one that throws', (): void => {
  const store: KeyValueStore = createWebStore((): WebStorage => {
    throw new Error('denied');
  });
  assert.equal(store.read('a'), null);
  assert.equal(store.write('a', '1'), false);
});
