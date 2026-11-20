import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ExploreGrid } from '../../sim/world/exploration.ts';
import type { FitView, MapFit, WorldBox } from './zone-fit.ts';
import { easeFit, fitBox, seenBox } from './zone-fit.ts';
import { mapMatrix, toMap } from './projection.ts';

const GRID: ExploreGrid = { columns: 10, rows: 8, cellSize: 2 };
const VIEW: FitView = { width: 375, height: 812, squash: 0.8, top: 90, bottom: 200, side: 52, minScale: 0, maxScale: 7, keepMargin: 0.15 };
const READABLE: FitView = { ...VIEW, minScale: 2.2 };

void test('the seen box wraps every seen cell and nothing else, and is empty when nothing is seen', (): void => {
  const seen: Uint8Array = new Uint8Array(GRID.columns * GRID.rows);
  assert.equal(seenBox(seen, GRID), null);
  seen[2 * GRID.columns + 3] = 1;
  seen[5 * GRID.columns + 7] = 1;
  assert.deepEqual(seenBox(seen, GRID), { minX: 6, minZ: 4, maxX: 16, maxZ: 12 });
});

void test('a fitted map puts every corner of the seen box inside the free part of the screen', (): void => {
  for (const box of [{ minX: 0, minZ: 0, maxX: 160, maxZ: 120 }, { minX: 40, minZ: 70, maxX: 52, maxZ: 76 }, { minX: 10, minZ: 10, maxX: 200, maxZ: 12 }] satisfies WorldBox[]) {
    const fit: MapFit = fitBox(box, VIEW, { x: box.minX, z: box.minZ });
    const matrix = mapMatrix({ scale: fit.scale, squash: VIEW.squash, centreX: fit.centreX, centreY: fit.centreY, focusX: fit.focusX, focusZ: fit.focusZ });
    for (const [x, z] of [[box.minX, box.minZ], [box.maxX, box.minZ], [box.minX, box.maxZ], [box.maxX, box.maxZ]] as const) {
      const at = toMap(matrix, x, z);
      assert.ok(at.x >= VIEW.side - 1e-6 && at.x <= VIEW.width - VIEW.side + 1e-6, `x ${at.x}`);
      assert.ok(at.y >= VIEW.top - 1e-6 && at.y <= VIEW.height - VIEW.bottom + 1e-6, `y ${at.y}`);
    }
    assert.ok(fit.scale <= VIEW.maxScale);
  }
});

void test('a small seen patch is drawn larger than the whole zone would be, up to the cap', (): void => {
  const whole: MapFit = fitBox({ minX: 0, minZ: 0, maxX: 160, maxZ: 120 }, VIEW, { x: 0, z: 0 });
  const patch: MapFit = fitBox({ minX: 40, minZ: 70, maxX: 60, maxZ: 85 }, VIEW, { x: 40, z: 70 });
  const speck: MapFit = fitBox({ minX: 40, minZ: 70, maxX: 41, maxZ: 71 }, VIEW, { x: 40, z: 70 });
  assert.ok(patch.scale > whole.scale);
  assert.equal(speck.scale, VIEW.maxScale);
});

void test('a seen area too wide to read on a phone is drawn at the readable scale, with the hero kept well inside the view', (): void => {
  const box: WorldBox = { minX: 0, minZ: 0, maxX: 400, maxZ: 400 };
  for (const hero of [{ x: 284, z: 35 }, { x: 10, z: 390 }, { x: 200, z: 200 }, { x: 395, z: 395 }]) {
    const fit: MapFit = fitBox(box, READABLE, hero);
    assert.equal(fit.scale, READABLE.minScale);
    const matrix = mapMatrix({ scale: fit.scale, squash: READABLE.squash, centreX: fit.centreX, centreY: fit.centreY, focusX: fit.focusX, focusZ: fit.focusZ });
    const at = toMap(matrix, hero.x, hero.z);
    const roomX: number = READABLE.width - READABLE.side * 2;
    const roomY: number = READABLE.height - READABLE.top - READABLE.bottom;
    assert.ok(Math.abs(at.x - fit.centreX) <= (roomX / 2) * (1 - READABLE.keepMargin) + 1e-6, `x ${at.x}`);
    assert.ok(Math.abs(at.y - fit.centreY) <= (roomY / 2) * (1 - READABLE.keepMargin) + 1e-6, `y ${at.y}`);
  }
  const middle: MapFit = fitBox(box, READABLE, { x: 200, z: 200 });
  assert.ok(Math.abs(middle.focusX - 200) < 1e-6 && Math.abs(middle.focusZ - 200) < 1e-6);
});

void test('a fitted view glides toward a new fit instead of jumping, and starts on the fit when nothing was shown', (): void => {
  const from: MapFit = { scale: 4, focusX: 10, focusZ: 20, centreX: 100, centreY: 200 };
  const to: MapFit = { scale: 6, focusX: 30, focusZ: 40, centreX: 120, centreY: 220 };
  assert.deepEqual(easeFit(null, to, 0.25), to);
  const half: MapFit = easeFit(from, to, 0.5);
  assert.deepEqual(half, { scale: 5, focusX: 20, focusZ: 30, centreX: 120, centreY: 220 });
  assert.deepEqual(easeFit(from, to, 1), to);
});
