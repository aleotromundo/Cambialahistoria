import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { ZoneDef } from '../../sim/content/types.ts';
import { stepWorld } from '../../sim/world/step.ts';
import type { World } from '../../sim/world/types.ts';
import { must, worldIn } from '../../test/support.ts';
import type { LayerLook, LayerPixels } from './layer.ts';
import { createLayerPixels, LAYER, TOUCH_LOOK } from './layer.ts';

const content = loadContent();

function cellsOf(pixels: LayerPixels, look: LayerLook): Set<number> {
  const cells: Set<number> = new Set<number>();
  for (let at: number = 0; at < pixels.data.length; at += LAYER.channels) {
    if (pixels.data[at + 3] === 0) continue;
    if (pixels.data[at] === look.wall[0] && pixels.data[at + 1] === look.wall[1] && pixels.data[at + 2] === look.wall[2]) cells.add(at / LAYER.channels);
  }
  return cells;
}

void test('the phone map draws every wall the desktop map draws, thicker, and only on solid ground', () => {
  const zone: ZoneDef = must([...content.zones.values()].find((each: ZoneDef): boolean => each.kind !== 'void'), 'a walled zone');
  const world: World = worldIn(content, zone.id, 3);
  stepWorld(world, [], 1 / 30);
  const desktop: LayerPixels = createLayerPixels();
  desktop.update(world);
  const phone: LayerPixels = createLayerPixels(TOUCH_LOOK);
  phone.update(world);
  const thin: Set<number> = cellsOf(desktop, LAYER);
  const thick: Set<number> = cellsOf(phone, TOUCH_LOOK);
  assert.ok(thin.size > 0);
  for (const cell of thin) assert.ok(thick.has(cell), `cell ${cell}`);
  assert.ok(thick.size > thin.size);
  for (const cell of thick) assert.equal(world.grid.solid[cell], 1, `cell ${cell}`);
});

void test('the phone map lays its floor and walls stronger than the desktop map', () => {
  assert.ok(TOUCH_LOOK.floor[3] > LAYER.floor[3]);
  assert.ok(TOUCH_LOOK.wall[3] >= LAYER.wall[3]);
  assert.ok(TOUCH_LOOK.wallCells > LAYER.wallCells);
});
