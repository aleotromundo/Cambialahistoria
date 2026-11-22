import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ScreenBox } from '../watch/duel-frame.ts';
import type { HudCovers, HudProbe, ScreenSize } from './hud-covers.ts';
import { coverBoxes, createHudCovers, HUD_COVERS } from './hud-covers.ts';

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface Screen {
  size: ScreenSize;
  panels: Rect[];
  probes: number;
}

function probeOf(screen: Screen): HudProbe {
  return {
    size: (): ScreenSize => screen.size,
    clickable: (x: number, y: number): boolean => {
      screen.probes += 1;
      return !screen.panels.some((rect: Rect): boolean => x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom);
    },
  };
}

function contains(boxes: readonly ScreenBox[], x: number, y: number): boolean {
  return boxes.some((box: ScreenBox): boolean => x >= box.left && x <= box.right && y >= box.bottom && y <= box.top);
}

void test('blocked cells merge into one box per run along each row, in screen units from -1 to 1, grown by half a cell for the cells sampled at their centres', (): void => {
  const blocked: boolean[] = [false, true, true, false, false, false, false, true];
  assert.deepEqual(coverBoxes(blocked, 4, 2), [
    { left: -0.75, right: 0.75, top: 1.5, bottom: -0.5 },
    { left: 0.25, right: 1.25, top: 0.5, bottom: -1.5 },
  ]);
  assert.deepEqual(coverBoxes([false, false, false, false], 2, 2), []);
});

void test('runs that line up in rows one under another merge into one tall box', (): void => {
  const blocked: boolean[] = [true, true, false, false, true, true, false, false, false, true, true, false];
  const boxes: ScreenBox[] = coverBoxes(blocked, 4, 3);
  const expected: readonly ScreenBox[] = [
    { left: -1.25, right: 0.25, top: 4 / 3, bottom: -2 / 3 },
    { left: -0.75, right: 0.75, top: 0, bottom: -4 / 3 },
  ];
  assert.equal(boxes.length, expected.length);
  expected.forEach((box: ScreenBox, at: number): void => {
    const seen: ScreenBox | undefined = boxes[at];
    assert.ok(seen !== undefined);
    for (const side of ['left', 'right', 'top', 'bottom'] as const) assert.ok(Math.abs(seen[side] - box[side]) < 1e-9, `${side} of box ${at}`);
  });
});

void test('the first look sweeps the whole screen and finds a bar along the bottom and a map in a corner', (): void => {
  const screen: Screen = { size: { width: 1024, height: 768 }, panels: [{ left: 256, top: 656, right: 768, bottom: 768 }, { left: 820, top: 0, right: 1024, bottom: 220 }], probes: 0 };
  const covers: HudCovers = createHudCovers(probeOf(screen));
  const boxes: readonly ScreenBox[] = covers.covers();
  assert.ok(contains(boxes, 0, -0.95));
  assert.ok(contains(boxes, 0.9, 0.9));
  assert.ok(!contains(boxes, 0, 0));
  assert.ok(!contains(boxes, -0.9, -0.95));
  assert.ok(!contains(boxes, -0.9, 0.9));
});

void test('a button shorter than a row of the old grid is found wherever it sits on a desktop screen', (): void => {
  for (let top: number = 0; top < 64; top += 4) {
    const screen: Screen = { size: { width: 1024, height: 768 }, panels: [{ left: 700, top: 300 + top, right: 764, bottom: 320 + top }], probes: 0 };
    const boxes: readonly ScreenBox[] = createHudCovers(probeOf(screen)).covers();
    const middle: number = 1 - ((310 + top) / 768) * 2;
    assert.ok(contains(boxes, (732 / 1024) * 2 - 1, middle), `button at ${String(300 + top)} px`);
  }
});

void test('after the first sweep each look reads one row, so a panel that opens is found within a sweep', (): void => {
  const screen: Screen = { size: { width: 1024, height: 768 }, panels: [], probes: 0 };
  const covers: HudCovers = createHudCovers(probeOf(screen));
  assert.deepEqual(covers.covers(), []);
  const swept: number = screen.probes;
  covers.covers();
  assert.equal(screen.probes - swept, HUD_COVERS.cols + 1);
  screen.panels.push({ left: 0, top: 0, right: 200, bottom: 768 });
  for (let look: number = 0; look < HUD_COVERS.rows; look += 1) covers.covers();
  assert.ok(contains(covers.covers(), -0.9, 0.5));
  assert.ok(contains(covers.covers(), -0.9, -0.5));
});

void test('a resize sweeps again at once', (): void => {
  const screen: Screen = { size: { width: 1024, height: 768 }, panels: [], probes: 0 };
  const covers: HudCovers = createHudCovers(probeOf(screen));
  covers.covers();
  screen.size = { width: 375, height: 812 };
  screen.panels.push({ left: 0, top: 700, right: 375, bottom: 812 });
  const boxes: readonly ScreenBox[] = covers.covers();
  assert.ok(contains(boxes, 0, -0.95));
  assert.ok(contains(boxes, -0.95, -0.95));
});

void test('a menu over the middle of the screen leaves the covers as they were', (): void => {
  const screen: Screen = { size: { width: 1024, height: 768 }, panels: [{ left: 256, top: 656, right: 768, bottom: 768 }], probes: 0 };
  const covers: HudCovers = createHudCovers(probeOf(screen));
  const before: readonly ScreenBox[] = covers.covers();
  screen.panels.push({ left: 0, top: 0, right: 1024, bottom: 768 });
  for (let look: number = 0; look < HUD_COVERS.rows * 2; look += 1) assert.deepEqual(covers.covers(), before);
});

void test('a screen with no size yet has no covers', (): void => {
  const screen: Screen = { size: { width: 0, height: 0 }, panels: [], probes: 0 };
  assert.deepEqual(createHudCovers(probeOf(screen)).covers(), []);
  assert.equal(screen.probes, 0);
});
