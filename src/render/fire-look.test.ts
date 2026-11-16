import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color } from 'three';
import { loadContent } from '../../sim/content/content.ts';
import type { AreaDelivery } from '../../sim/content/shape-types.ts';
import type { Content, SkillDef } from '../../sim/content/types.ts';
import type { Vec2 } from '../../sim/math.ts';
import { must } from '../../test/support.ts';
import type { FireKit } from './fire-look.ts';
import { burnsAsFire, burnTongues, FIRE_LOOK, flare, heatGlow, heatShare, hotter, lick, rimSpot } from './fire-look.ts';

interface Recorded {
  readonly sprays: { readonly x: number; readonly y: number; readonly z: number; readonly color: Color }[];
  readonly rings: number[];
  readonly lights: number[];
}

function recordingKit(): { readonly kit: FireKit; readonly seen: Recorded } {
  const seen: Recorded = { sprays: [], rings: [], lights: [] };
  const kit: FireKit = {
    spray: (x: number, y: number, z: number, color: Color): void => {
      seen.sprays.push({ x, y, z, color: color.clone() });
    },
    ring: (_x: number, _z: number, radius: number): void => {
      seen.rings.push(radius);
    },
    flashLight: (_x: number, _y: number, _z: number, _color: Color, intensity: number): void => {
      seen.lights.push(intensity);
    },
  };
  return { kit, seen };
}

function steady(value: number): () => number {
  return (): number => value;
}

const content: Content = loadContent();

function areaOf(id: string): AreaDelivery {
  const skill: SkillDef = must(content.skills.get(id), id);
  if (skill.delivery.type !== 'area') throw new Error(`${id} is not an area`);
  return skill.delivery;
}

void test('a lasting fire area burns as fire, while a burst with its own look and a storm area do not', (): void => {
  assert.ok(burnsAsFire(must(content.skills.get('banked_fire'), 'banked_fire').vfx));
  assert.ok(burnsAsFire(must(content.skills.get('gathered_embers'), 'gathered_embers').vfx));
  assert.ok(!burnsAsFire(must(content.skills.get('fire_burst'), 'fire_burst').vfx));
  assert.ok(!burnsAsFire(must(content.skills.get('storm_bolt'), 'storm_bolt').vfx));
});

void test('banked fire heats from cold to full with its stoke, and an unstoked fire stays cold', (): void => {
  const banked: AreaDelivery = areaOf('banked_fire');
  assert.equal(heatShare(banked, 0), 0);
  assert.ok(Math.abs(heatShare(banked, 1) - 0.2) < 1e-9);
  assert.equal(heatShare(banked, 5), 1);
  assert.equal(heatShare(banked, 9), 1);
  assert.equal(heatShare(areaOf('gathered_embers'), 4), 0);
});

void test('a hotter fire leans its colour toward white heat and glows brighter, never past full heat', (): void => {
  const base: Color = new Color(0xff6a1c);
  assert.ok(hotter(base, 0).equals(base));
  assert.ok(hotter(base, 1).g > base.g && hotter(base, 1).b > base.b);
  assert.ok(hotter(base, 3).equals(hotter(base, 1)));
  assert.equal(heatGlow(0.5, 0), 0.5);
  assert.ok(Math.abs(heatGlow(0.5, 1) - 0.5 * (1 + FIRE_LOOK.heatGlow)) < 1e-9);
  assert.equal(heatGlow(0.5, 2), heatGlow(0.5, 1));
});

void test('flames rise between the inner band and the rim of the area', (): void => {
  const center: Vec2 = { x: 2, z: -1 };
  const inner: Vec2 = rimSpot(center, 4, 0, 0);
  const outer: Vec2 = rimSpot(center, 4, Math.PI / 2, 1);
  assert.ok(Math.abs(Math.hypot(inner.x - center.x, inner.z - center.z) - 4 * FIRE_LOOK.lickInner) < 1e-9);
  assert.ok(Math.abs(Math.hypot(outer.x - center.x, outer.z - center.z) - 4) < 1e-9);
});

void test('a hot fire licks with more tongues than a cold one, all inside its radius', (): void => {
  const cold = recordingKit();
  lick(cold.kit, { x: 0, z: 0 }, 3, 0, new Color(0xff8a3a), 0, steady(0.9));
  const hot = recordingKit();
  lick(hot.kit, { x: 0, z: 0 }, 3, 0, new Color(0xff8a3a), 1, steady(0.9));
  assert.equal(cold.seen.sprays.length, FIRE_LOOK.lickTongues);
  assert.equal(hot.seen.sprays.length, FIRE_LOOK.lickTongues + FIRE_LOOK.lickHotTongues);
  for (const spray of hot.seen.sprays) assert.ok(Math.hypot(spray.x, spray.z) <= 3 + 1e-9);
});

void test('each strike flares a full ring of flame with a flash that grows with the heat', (): void => {
  const cold = recordingKit();
  flare(cold.kit, { x: 0, z: 0 }, 4, new Color(0xff8a3a), 0);
  const hot = recordingKit();
  flare(hot.kit, { x: 0, z: 0 }, 4, new Color(0xff8a3a), 1);
  assert.equal(cold.seen.sprays.length, FIRE_LOOK.flareTongues);
  assert.equal(hot.seen.sprays.length, FIRE_LOOK.flareTongues + FIRE_LOOK.flareHotTongues);
  assert.deepEqual(cold.seen.rings, [4 * FIRE_LOOK.flareRing]);
  assert.ok(must(hot.seen.lights[0], 'hot light') > must(cold.seen.lights[0], 'cold light'));
});

void test('a burning body sends up the tongues it is due, close about it and off the ground', (): void => {
  const { kit, seen } = recordingKit();
  burnTongues(kit, { x: 1, z: 1 }, new Color(0xff6a1c), 3, steady(0.5));
  assert.equal(seen.sprays.length, 3);
  for (const spray of seen.sprays) {
    assert.ok(Math.hypot(spray.x - 1, spray.z - 1) <= FIRE_LOOK.burnSpread);
    assert.ok(spray.y >= FIRE_LOOK.burnLow && spray.y <= FIRE_LOOK.burnHigh);
  }
});
