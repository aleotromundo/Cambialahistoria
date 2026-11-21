import type { ZoneDef } from './content/types.ts';

export const ZONE_CACHE = {
  most: 6,
  numberBytes: 8,
} as const;

export interface ZoneCacheOptions {
  readonly keepsStanding: boolean;
  readonly most: number;
}

export interface ZoneCache<V> {
  readonly name: string;
  get(zone: ZoneDef): V | undefined;
  set(zone: ZoneDef, value: V): void;
  has(zone: ZoneDef): boolean;
  zones(): readonly ZoneDef[];
}

interface Store {
  readonly name: string;
  readonly keepsStanding: boolean;
  readonly entries: Map<ZoneDef, unknown>;
}

const stores: Set<Store> = new Set<Store>();

const DEFAULT_OPTIONS: ZoneCacheOptions = { keepsStanding: true, most: ZONE_CACHE.most };

export function zoneCache<V>(name: string, options: Partial<ZoneCacheOptions> = {}): ZoneCache<V> {
  const settings: ZoneCacheOptions = { ...DEFAULT_OPTIONS, ...options };
  const entries: Map<ZoneDef, V> = new Map<ZoneDef, V>();
  stores.add({ name, keepsStanding: settings.keepsStanding, entries });
  let newest: ZoneDef | null = null;
  return {
    name,
    get(zone: ZoneDef): V | undefined {
      const known: V | undefined = entries.get(zone);
      if (known === undefined || newest === zone) return known;
      entries.delete(zone);
      entries.set(zone, known);
      newest = zone;
      return known;
    },
    set(zone: ZoneDef, value: V): void {
      entries.delete(zone);
      entries.set(zone, value);
      newest = zone;
      for (const oldest of entries.keys()) {
        if (entries.size <= settings.most) break;
        entries.delete(oldest);
      }
    },
    has(zone: ZoneDef): boolean {
      return entries.has(zone);
    },
    zones(): readonly ZoneDef[] {
      return [...entries.keys()];
    },
  };
}

export function keepZones(standing: ZoneDef | null, near: ReadonlySet<ZoneDef>): void {
  for (const store of stores) {
    for (const zone of store.entries.keys()) {
      if (near.has(zone) || (store.keepsStanding && zone === standing)) continue;
      store.entries.delete(zone);
    }
  }
}

export function heldZones(): ReadonlyMap<string, number> {
  const held: Map<string, number> = new Map<string, number>();
  for (const store of stores) held.set(store.name, (held.get(store.name) ?? 0) + store.entries.size);
  return held;
}

function bytesOf(value: unknown, seen: Set<object>): number {
  if (typeof value !== 'object' || value === null || seen.has(value)) return 0;
  seen.add(value);
  if (ArrayBuffer.isView(value)) {
    if (seen.has(value.buffer)) return 0;
    seen.add(value.buffer);
    return value.buffer.byteLength;
  }
  if (value instanceof Map) {
    let total: number = 0;
    for (const [key, entry] of value) total += bytesOf(key, seen) + bytesOf(entry, seen);
    return total;
  }
  if (value instanceof Set || Array.isArray(value)) {
    let total: number = 0;
    for (const entry of value) total += typeof entry === 'number' ? ZONE_CACHE.numberBytes : bytesOf(entry, seen);
    return total;
  }
  let total: number = 0;
  for (const entry of Object.values(value)) total += bytesOf(entry, seen);
  return total;
}

export function heldBytes(shared: readonly object[] = []): ReadonlyMap<string, number> {
  const held: Map<string, number> = new Map<string, number>();
  const seen: Set<object> = new Set<object>(shared);
  for (const store of stores) {
    let total: number = 0;
    for (const value of store.entries.values()) total += bytesOf(value, seen);
    held.set(store.name, (held.get(store.name) ?? 0) + total);
  }
  return held;
}
