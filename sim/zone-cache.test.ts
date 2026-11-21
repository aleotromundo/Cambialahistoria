import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content/content.ts';
import type { Content, ZoneDef } from './content/types.ts';
import type { ZoneCache } from './zone-cache.ts';
import { heldBytes, heldZones, keepZones, zoneCache } from './zone-cache.ts';

const content: Content = loadContent();
const zones: readonly ZoneDef[] = [...content.zones.values()];

function zoneAt(index: number): ZoneDef {
  const zone: ZoneDef | undefined = zones[index];
  assert.ok(zone !== undefined, `the content has a zone at ${index}`);
  return zone;
}

void test('a zone cache holds at most its limit and lets go of the zone used longest ago', (): void => {
  const cache: ZoneCache<number> = zoneCache<number>('limit', { most: 2 });
  cache.set(zoneAt(0), 0);
  cache.set(zoneAt(1), 1);
  assert.equal(cache.get(zoneAt(0)), 0);
  cache.set(zoneAt(2), 2);
  assert.deepEqual(cache.zones(), [zoneAt(0), zoneAt(2)]);
  assert.equal(cache.has(zoneAt(1)), false);
  keepZones(null, new Set<ZoneDef>());
});

void test('keeping zones lets go of every other zone in every cache, and the standing zone only where the cache keeps it', (): void => {
  const nav: ZoneCache<number> = zoneCache<number>('standing kept');
  const built: ZoneCache<number> = zoneCache<number>('standing dropped', { keepsStanding: false });
  for (const cache of [nav, built]) for (const index of [0, 1, 2]) cache.set(zoneAt(index), index);
  keepZones(zoneAt(0), new Set<ZoneDef>([zoneAt(1)]));
  assert.deepEqual(nav.zones(), [zoneAt(0), zoneAt(1)]);
  assert.deepEqual(built.zones(), [zoneAt(1)]);
  keepZones(null, new Set<ZoneDef>());
  assert.equal(heldZones().get('standing kept'), 0);
  assert.equal(heldZones().get('standing dropped'), 0);
});

void test('held bytes count each buffer once, look inside maps and arrays, and skip what is shared', (): void => {
  const sharing: { readonly big: Float32Array } = { big: new Float32Array(1000) };
  const cache: ZoneCache<{ readonly own: Uint8Array; readonly also: Uint8Array; readonly list: readonly Float64Array[]; readonly byName: ReadonlyMap<string, Float32Array>; readonly content: { readonly big: Float32Array } }> = zoneCache('bytes');
  const own: Uint8Array = new Uint8Array(16);
  cache.set(zoneAt(0), { own, also: own, list: [new Float64Array(4)], byName: new Map<string, Float32Array>([['a', new Float32Array(8)]]), content: sharing });
  cache.set(zoneAt(1), { own: new Uint8Array(0), also: new Uint8Array(0), list: [], byName: new Map<string, Float32Array>(), content: sharing });
  assert.equal(heldBytes([sharing]).get('bytes'), 16 + 32 + 32);
  assert.equal(heldBytes().get('bytes'), 16 + 32 + 32 + 4000);
  keepZones(null, new Set<ZoneDef>());
});
