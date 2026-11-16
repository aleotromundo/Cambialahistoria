import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color } from 'three';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, SkillDef } from '../../sim/content/types.ts';
import type { Vec2 } from '../../sim/math.ts';
import { lap, lapSpot, poolOf, splash, surge, swell, swirlHeading, whirl, WATER_LOOK } from './water-look.ts';
import type { WaterKit } from './water-look.ts';

const content: Content = loadContent();

interface Recorded {
  readonly sprays: number[];
  readonly rings: number[];
  readonly kit: WaterKit;
}

function recorder(): Recorded {
  const sprays: number[] = [];
  const rings: number[] = [];
  return { sprays, rings, kit: { spray: (_x: number, _y: number, _z: number, _color: Color, count: number): void => { sprays.push(count); }, ring: (_x: number, _z: number, radius: number): void => { rings.push(radius); } } };
}

void test('Still Water lies as a deep pool, a shadow skill keeps its shadow and a plain skill has no pool', (): void => {
  const still: SkillDef = must(content.skills.get('still_water'), 'still_water');
  assert.ok(still.vfx.water !== null);
  assert.deepEqual(poolOf(still.vfx), { color: still.vfx.water.deep, strength: still.vfx.water.depth });
  const umbra: SkillDef = must(content.skills.get('umbra'), 'umbra');
  assert.deepEqual(poolOf(umbra.vfx), umbra.vfx.shadow);
  assert.equal(poolOf(must(content.skills.get('cleave'), 'cleave').vfx), null);
});

void test('a lap stays inside the pool and lays a small ripple with a few drops', (): void => {
  const center: Vec2 = { x: 3, z: -2 };
  for (const share of [0, 0.3, 1]) {
    const spot: Vec2 = lapSpot(center, 4, 1.1, share);
    assert.ok(Math.hypot(spot.x - center.x, spot.z - center.z) <= 4 * WATER_LOOK.lapReach + 1e-9);
  }
  const seen: Recorded = recorder();
  lap(seen.kit, center, 4, new Color(1, 1, 1), (): number => 0.5);
  assert.deepEqual(seen.sprays, [WATER_LOOK.lapDrops]);
  assert.equal(seen.rings.length, 1);
  const ripple: number | undefined = seen.rings[0];
  assert.ok(ripple !== undefined && ripple >= WATER_LOOK.lapRingMin && ripple <= WATER_LOOK.lapRingMax);
});

void test('a splash throws its drops up from where the water strikes', (): void => {
  const seen: Recorded = recorder();
  splash(seen.kit, { x: 0, z: 0 }, new Color(1, 1, 1));
  assert.deepEqual(seen.sprays, [WATER_LOOK.splashDrops]);
  assert.deepEqual(seen.rings, []);
});

void test('a pulse of still water swells out as one faint ring inside the pool, with no drops', (): void => {
  const seen: Recorded = recorder();
  swell(seen.kit, { x: 0, z: 0 }, 4, new Color(1, 1, 1));
  assert.deepEqual(seen.rings, [4 * WATER_LOOK.swellReach]);
  assert.deepEqual(seen.sprays, []);
});

void test('a whirlpool turns its foam inward and around, never straight out', (): void => {
  for (const angle of [0, 1, 2.5, 4, 6]) {
    const heading: number = swirlHeading(angle);
    const outward: number = Math.sin(angle) * Math.sin(heading) + Math.cos(angle) * Math.cos(heading);
    assert.ok(outward < 0, `foam at ${String(angle)} heads outward`);
  }
  const seen: Recorded = recorder();
  whirl(seen.kit, { x: 0, z: 0 }, 5, 10, new Color(1, 1, 1), (): number => 0.5);
  assert.equal(seen.sprays.length, WATER_LOOK.swirlMotes);
});

void test('a whirlpool that pulls under throws one fountain of drops from its middle', (): void => {
  const seen: Recorded = recorder();
  surge(seen.kit, { x: 0, z: 0 }, new Color(1, 1, 1));
  assert.deepEqual(seen.sprays, [WATER_LOOK.surgeDrops]);
});
