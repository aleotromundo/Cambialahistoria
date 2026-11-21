import type { KeyValueStore } from './backend/backend.ts';
import { createWebStore } from './web-storage.ts';
import type { WebStorage } from './web-storage.ts';

export function storageReady(): Promise<void> {
  return Promise.resolve();
}

export function createBrowserStore(): KeyValueStore {
  return createWebStore((): WebStorage => window.localStorage);
}
