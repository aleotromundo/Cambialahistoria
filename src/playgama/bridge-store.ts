import { isFields } from '../../sim/content/read.ts';
import type { KeyValueStore, Timers } from '../backend/backend.ts';
import { within } from '../bounded-wait.ts';
import type { Bridge } from './bridge.ts';

export const BRIDGE_STORE = {
  key: 'the-lost-storm',
  settleMs: 1500,
  setWaitMs: 5000,
} as const;

export interface BridgeStore extends KeyValueStore {
  flush(): Promise<void>;
}

function parsedText(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed;
  } catch {
    return null;
  }
}

export function readEntries(value: unknown): Map<string, string> {
  const entries: Map<string, string> = new Map<string, string>();
  const parsed: unknown = parsedText(value);
  if (!isFields(parsed)) return entries;
  for (const [key, entry] of Object.entries(parsed)) {
    if (typeof entry === 'string') entries.set(key, entry);
  }
  return entries;
}

export function entriesText(entries: ReadonlyMap<string, string>): string {
  return JSON.stringify(Object.fromEntries(entries));
}

export async function loadBridgeStore(bridge: Bridge, timers: Timers): Promise<BridgeStore> {
  const [found]: readonly unknown[] = await bridge.storageGet([BRIDGE_STORE.key]);
  const entries: Map<string, string> = readEntries(found);
  let dirty: boolean = false;
  let cancel: (() => void) | null = null;
  let writing: Promise<void> = Promise.resolve();
  const settled = async (text: string, late: { now: boolean }): Promise<void> => {
    try {
      await bridge.storageSet([BRIDGE_STORE.key], [text]);
    } catch {
      dirty = true;
      return;
    }
    if (!late.now) return;
    dirty = true;
    void flush();
  };
  const written = async (text: string): Promise<void> => {
    const late: { now: boolean } = { now: false };
    if (await within(settled(text, late), timers, BRIDGE_STORE.setWaitMs)) return;
    late.now = true;
    dirty = true;
  };
  const flush = (): Promise<void> => {
    cancel?.();
    cancel = null;
    if (!dirty) return writing;
    dirty = false;
    const text: string = entriesText(entries);
    writing = writing.then((): Promise<void> => written(text));
    return writing;
  };
  const changed = (): void => {
    dirty = true;
    cancel ??= timers.after(BRIDGE_STORE.settleMs, (): void => void flush());
  };
  return {
    read: (key: string): string | null => entries.get(key) ?? null,
    write(key: string, value: string): boolean {
      if (entries.get(key) === value) return true;
      entries.set(key, value);
      changed();
      return true;
    },
    remove(key: string): void {
      if (!entries.delete(key)) return;
      changed();
    },
    flush,
  };
}
