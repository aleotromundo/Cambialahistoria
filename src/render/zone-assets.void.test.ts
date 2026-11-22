import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import { zoneModels, zoneSurfaces } from './zone-assets.ts';

const content: Content = loadContent();

void test('a void zone keeps the models of its glimpses and of the rubble along its shore path, so leaving another zone never frees them', (): void => {
  let checked: number = 0;
  for (const zone of content.zones.values()) {
    if (zone.void === null) continue;
    const models: Set<string> = zoneModels(content, zone);
    const props: string[] = [...(zone.void.shore?.path?.rubble ?? []), ...zone.void.glimpses.flatMap((glimpse): string[] => glimpse.pieces.map((piece): string => piece.prop))];
    for (const propId of props) {
      const model: string | undefined = content.props.get(propId)?.model;
      assert.ok(model !== undefined && models.has(model), `${zone.id} does not keep ${propId}`);
      checked += 1;
    }
  }
  assert.ok(checked > 0);
});

void test('a void zone keeps the surface of every pool on its shore, so releasing other zones never frees a texture the pools still draw', (): void => {
  let checked: number = 0;
  for (const zone of content.zones.values()) {
    const kept: Set<string> = zoneSurfaces(content, zone);
    for (const pool of zone.void?.shore?.pools ?? []) {
      assert.ok(kept.has(pool.surface), `${zone.id} does not keep ${pool.surface}`);
      checked += 1;
    }
  }
  assert.ok(checked > 0);
});
