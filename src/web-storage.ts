import type { KeyValueStore } from './backend/backend.ts';

export interface WebStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createWebStore(storage: () => WebStorage): KeyValueStore {
  return {
    read(key: string): string | null {
      try {
        return storage().getItem(key);
      } catch {
        return null;
      }
    },
    write(key: string, value: string): boolean {
      try {
        storage().setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    remove(key: string): void {
      try {
        storage().removeItem(key);
      } catch {
        return;
      }
    },
  };
}
