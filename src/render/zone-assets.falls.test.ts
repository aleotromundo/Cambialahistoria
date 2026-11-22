import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, ZoneDef } from '../../sim/content/types.ts';
import { zoneSurfaces } from './zone-assets.ts';

void test('a zone keeps the surface of every lava fall in it, so a fall never samples a freed texture', (): void => {
  const content: Content = loadContent();
  const withFalls: ZoneDef[] = [...content.zones.values()].filter((zone: ZoneDef): boolean => zone.falls.length > 0);
  assert.ok(withFalls.length > 0);
  for (const zone of withFalls) {
    const kept: Set<string> = zoneSurfaces(content, zone);
    for (const fall of zone.falls) assert.ok(kept.has(fall.surface), `${zone.id} keeps ${fall.surface}`);
  }
});
