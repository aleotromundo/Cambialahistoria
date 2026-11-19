import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { must } from '../../test/support.ts';
import type { Arena } from './arena.ts';
import { arenaObservation, createArena } from './arena.ts';
import { MOVE_CHOICES, SELF_FEATURES } from './contract.ts';
import { dangerAround } from './danger.ts';
import { moveDirection } from './moves.ts';
import type { Observation } from './observe.ts';

const CONTENT: Content = loadContent();

function selfValue(seen: Observation, name: string): number {
  return seen.obs[SELF_FEATURES.indexOf(name)] ?? Number.NaN;
}

void test('the hero sees the decision it made last', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 13, jitter: 0, waves: 1 });
  assert.equal(selfValue(arenaObservation(arena), 'last_skill'), 0);
  arena.last = { move: 3, skill: 2, target: 0, use: 1 };
  const seen: Observation = arenaObservation(arena);
  const way: Vec2 = must(moveDirection(3), 'direction');
  assert.ok(Math.abs(selfValue(seen, 'last_dx') - way.x) < 1e-6);
  assert.ok(Math.abs(selfValue(seen, 'last_dz') - way.z) < 1e-6);
  assert.equal(selfValue(seen, 'last_skill'), 1);
  assert.equal(selfValue(seen, 'last_use'), 1);
});

void test('the danger in each move direction is written in move order', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 13, jitter: 0, waves: 1 });
  const seen: Observation = arenaObservation(arena);
  const danger: number[] = dangerAround(arena.world);
  for (let move: number = 0; move < MOVE_CHOICES; move += 1) assert.equal(selfValue(seen, `danger_${move}`), danger[move]);
});
