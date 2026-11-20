import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PhoneLayout, PhoneScreen, Rect, SafeInsets } from './phone-layout.ts';
import { overlaps, PHONE, phoneLayout } from './phone-layout.ts';

const NO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const NOTCH_PORTRAIT: SafeInsets = { top: 47, right: 0, bottom: 34, left: 0 };
const NOTCH_LANDSCAPE: SafeInsets = { top: 0, right: 47, bottom: 21, left: 47 };

const PORTRAIT: readonly PhoneScreen[] = [
  { width: 375, height: 812, safe: NO_INSETS },
  { width: 430, height: 932, safe: NO_INSETS },
  { width: 390, height: 844, safe: NOTCH_PORTRAIT },
  { width: 375, height: 667, safe: NO_INSETS },
  { width: 360, height: 640, safe: NO_INSETS },
];

const LANDSCAPE: readonly PhoneScreen[] = [
  { width: 844, height: 390, safe: NOTCH_LANDSCAPE },
  { width: 667, height: 375, safe: NO_INSETS },
];

const right = (rect: Rect): number => rect.x + rect.w;
const bottom = (rect: Rect): number => rect.y + rect.h;
const label = (screen: PhoneScreen): string => `${screen.width}x${screen.height}`;

void test('on a portrait phone the menu stands as a rail on the right edge under the minimap, clear of the globes and every control', (): void => {
  for (const screen of PORTRAIT) {
    const layout: PhoneLayout = phoneLayout(screen, { skills: 6, flasks: 2, menu: 7 });
    const rail: Rect = layout.menu.rect;
    assert.ok(layout.menu.rail, label(screen));
    assert.equal(rail.w, PHONE.menuButton, label(screen));
    assert.equal(right(rail), right(layout.minimap), label(screen));
    if (layout.caption === null) assert.fail(label(screen));
    assert.equal(rail.y, bottom(layout.caption) + PHONE.gap, label(screen));
    assert.ok(layout.menu.button >= PHONE.menuButton, label(screen));
    for (const rect of [layout.life, layout.mana, layout.stick, layout.attack, layout.hint, layout.toast, ...layout.skills, ...layout.flasks]) assert.equal(overlaps(rail, rect), false, label(screen));
    assert.ok(bottom(rail) + PHONE.gap <= layout.attack.y, label(screen));
  }
});

void test('on a portrait phone the minimap grows with the screen and its level line sits under it, not on it', (): void => {
  for (const screen of PORTRAIT) {
    const layout: PhoneLayout = phoneLayout(screen, { skills: 5, flasks: 2, menu: 6 });
    assert.ok(layout.minimap.w > PHONE.minimapPortrait || screen.width * PHONE.minimapRailShare <= PHONE.minimapRailMin, label(screen));
    if (layout.caption === null) assert.fail(label(screen));
    assert.equal(layout.caption.y, bottom(layout.minimap), label(screen));
    assert.equal(overlaps(layout.caption, layout.minimap), false, label(screen));
  }
  const small: PhoneLayout = phoneLayout({ width: 375, height: 812, safe: NO_INSETS }, { skills: 5, flasks: 2, menu: 6 });
  const large: PhoneLayout = phoneLayout({ width: 430, height: 932, safe: NO_INSETS }, { skills: 5, flasks: 2, menu: 6 });
  assert.ok(large.minimap.w > small.minimap.w);
});

void test('the quest list stands beside the rail and leaves the target and the frame meter their room under the globes', (): void => {
  for (const screen of PORTRAIT) {
    const layout: PhoneLayout = phoneLayout(screen, { skills: 5, flasks: 2, menu: 6 });
    if (layout.quests === null) assert.fail(label(screen));
    assert.ok(right(layout.quests) + PHONE.gap <= layout.menu.rect.x, label(screen));
    assert.ok(layout.target.w >= PHONE.targetMinWidth && layout.meter.w >= PHONE.meterMinWidth, label(screen));
  }
});

void test('a landscape phone keeps the menu as a row along the top with the level inside the minimap', (): void => {
  for (const screen of LANDSCAPE) {
    const layout: PhoneLayout = phoneLayout(screen, { skills: 5, flasks: 2, menu: 6 });
    assert.equal(layout.menu.rail, false, label(screen));
    assert.equal(layout.menu.rect.h, layout.menu.button, label(screen));
    assert.equal(layout.caption, null, label(screen));
  }
});

void test('a portrait screen too short for the rail falls back to the menu row', (): void => {
  const layout: PhoneLayout = phoneLayout({ width: 320, height: 480, safe: NO_INSETS }, { skills: 6, flasks: 2, menu: 7 });
  assert.equal(layout.menu.rail, false);
  assert.equal(layout.caption, null);
});
