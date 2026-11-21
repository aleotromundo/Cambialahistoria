import type { KeyValueStore } from './backend/backend.ts';
import { browserPlaygama } from './playgama/browser.ts';
import type { PlaygamaStart } from './playgama/host.ts';
import { createWebStore } from './web-storage.ts';
import type { WebStorage } from './web-storage.ts';

let adopted: KeyValueStore | null = null;

export async function storageReady(): Promise<void> {
  const started: PlaygamaStart | null = await browserPlaygama();
  adopted = started?.store ?? null;
}

export function createBrowserStore(): KeyValueStore {
  return adopted ?? createWebStore((): WebStorage => window.localStorage);
}
