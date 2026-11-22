import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { ZoneDuel } from '../content/types.ts';
import { offset, shapeArena } from '../../test/shape-support.ts';
import { must, zoneOf } from '../../test/support.ts';
import { versusScale } from '../world/combat.ts';
import type { PlayerState, World } from '../world/types.ts';
import { ENTITY_FEATURES, RL, SELF_FEATURES, SLOT_FEATURES } from './contract.ts';
import type { ObserveContext } from './observe.ts';
import { observe } from './observe.ts';
import { createRecall } from './recall.ts';

const PROVING: ZoneDuel = must(zoneOf(loadContent(), 'proving_ground').duel, 'proving ground duel');
const RIVAL = { party: 1, apart: 6 } as const;

function context(): ObserveContext {
  return { situation: 'duel', objective: null, timeLeft: 0, progress: 0, recall: createRecall(), pickup: { minRarity: 0 } };
}

function rivalDamage(duel: ZoneDuel | null): number {
  const world: World = shapeArena([]);
  world.zone = { ...world.zone, duel };
  world.player.pos = offset(0, 0);
  const rival: PlayerState = { ...shapeArena([]).player, id: world.nextId, pos: offset(RIVAL.apart, 0), party: RIVAL.party };
  world.nextId += 1;
  world.heroes.push(rival);
  const seen = observe(world, context(), world.player);
  return seen.obs[SELF_FEATURES.length + RL.slots * SLOT_FEATURES.length + ENTITY_FEATURES.indexOf('damage')] ?? Number.NaN;
}

void test('a rival hero in a duel zone is seen dealing the duel share of its damage', (): void => {
  const whole: number = rivalDamage(null);
  assert.ok(whole > 0);
  assert.ok(Math.abs(rivalDamage(PROVING) - whole * PROVING.heroDamage) < 1e-6);
});

void test('only a hero striking a hero is scaled by the duel rules', (): void => {
  const world: World = shapeArena([]);
  world.zone = { ...world.zone, duel: PROVING };
  const rival: PlayerState = { ...world.player, id: world.nextId };
  assert.equal(versusScale(world, rival, world.player), PROVING.heroDamage);
  assert.equal(versusScale(world, null, world.player), 1);
  world.zone = { ...world.zone, duel: null };
  assert.equal(versusScale(world, rival, world.player), 1);
});
