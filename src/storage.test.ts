import assert from 'node:assert/strict';
import { test } from 'node:test';
import { storageReady } from './storage.ts';

void test('the browser store needs no start: it is ready at once', async (): Promise<void> => {
  await assert.doesNotReject(storageReady());
});
