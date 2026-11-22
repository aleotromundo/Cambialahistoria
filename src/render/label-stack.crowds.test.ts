import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createRng } from '../../sim/rng.ts';
import type { Rng } from '../../sim/rng.ts';
import { settleLabels } from './label-stack.ts';
import type { RankedBox, ScreenRect, SettleView } from './label-stack.ts';

interface Crowd {
  readonly view: SettleView;
  readonly boxes: readonly RankedBox[];
  readonly blockers: readonly ScreenRect[];
}

function bigCrowds(seed: number, count: number): Crowd[] {
  const rng: Rng = createRng(seed);
  return Array.from({ length: count }, (): Crowd => {
    const view: SettleView = rng.chance(0.3) ? { width: 844, height: 390 } : { width: 1280, height: 720 };
    const middle: { readonly x: number; readonly y: number } = { x: rng.range(0, view.width), y: rng.range(0, view.height) };
    const spread: number = rng.chance(0.5) ? 40 : 400;
    const boxes: RankedBox[] = Array.from({ length: rng.int(40, 110) }, (_: unknown, index: number): RankedBox => ({
      id: index + 1,
      x: rng.chance(0.2) ? Math.round(middle.x) : middle.x + rng.range(-spread, spread) / 2,
      y: rng.chance(0.2) ? Math.round(middle.y) : middle.y + rng.range(-spread, spread) / 2,
      width: rng.chance(0.3) ? 90 : rng.range(40, 200),
      height: rng.chance(0.5) ? 20 : rng.range(16, 26),
      rank: rng.int(0, 3),
    }));
    const blockers: ScreenRect[] = Array.from({ length: rng.int(0, 12) }, (): ScreenRect => {
      const left: number = rng.range(0, view.width);
      const top: number = rng.range(0, view.height);
      return { left, top, right: left + rng.range(20, 420), bottom: top + rng.range(10, 210) };
    });
    return { view, boxes, blockers };
  });
}

void test('forty crowds of forty to a hundred and ten labels settle exactly where they always have', (): void => {
  const spots = bigCrowds(11, 40).map((crowd: Crowd) => Array.from(settleLabels(crowd.boxes, 2, crowd.view, crowd.blockers)));
  assert.equal(createHash('sha256').update(JSON.stringify(spots)).digest('hex'), 'bd9333e2c84393167953b201dda0b30bf6dc0eb6a5786c34ce1a545aa76dbb5f');
});
