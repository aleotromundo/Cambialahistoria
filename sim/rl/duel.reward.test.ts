import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, SkillDef } from '../content/types.ts';
import { must } from '../../test/support.ts';
import { applyHit, offenceOf } from '../world/combat.ts';
import type { PlayerState, WorldEvent } from '../world/types.ts';
import type { Duel, DuelSeat } from './duel.ts';
import { afterDuelTick, createDuel, DUEL } from './duel.ts';
import { emptyTally, REWARD, rewardFor } from './reward.ts';

const CONTENT: Content = loadContent();
const SEED: number = 73;
const WINNER_LOST: number = 0.7;

function seats(duel: Duel): readonly [DuelSeat, DuelSeat] {
  return [must(duel.seats[0], 'first seat'), must(duel.seats[1], 'second seat')];
}

function hit(duel: Duel, striker: PlayerState, target: PlayerState): WorldEvent[] {
  const skill: SkillDef = must(CONTENT.skills.get('cleave'), 'cleave');
  duel.world.events = [];
  assert.ok(applyHit(duel.world, offenceOf(striker), target, skill, { x: 1, z: 0 }));
  return duel.world.events;
}

void test('a hit in a duel costs the hero who takes it what it pays the hero who lands it', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: SEED, jitter: 0 });
  const [first, second] = seats(duel);
  first.hero.maxLife = second.hero.maxLife;
  first.hero.life = first.hero.maxLife;
  second.hero.life = second.hero.maxLife;
  const rewards: number[] = [0, 0];
  afterDuelTick(duel, hit(duel, first.hero, second.hero), rewards);
  assert.ok((rewards[0] ?? 0) > 0);
  assert.ok(Math.abs((rewards[0] ?? 0) + (rewards[1] ?? 0)) < 1e-9);
});

void test('a duel that reaches its limit charges both heroes the stalemate', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: SEED, jitter: 0 });
  duel.world.time = duel.start + DUEL.timeLimit;
  const rewards: number[] = [0, 0];
  afterDuelTick(duel, [], rewards);
  for (const seat of seats(duel)) {
    assert.equal(seat.outcome, 'timeout');
    assert.equal(seat.total, -DUEL.stalemate);
  }
  assert.deepEqual(rewards, [-DUEL.stalemate, -DUEL.stalemate]);
});

void test('a decided duel pays more per seat than a stalemate', (): void => {
  const winner: number = REWARD.dealt + REWARD.kill + REWARD.win - WINNER_LOST * DUEL.taken;
  const loser: number = WINNER_LOST * REWARD.dealt - DUEL.taken - REWARD.death;
  assert.ok((winner + loser) / 2 > -DUEL.stalemate);
});

void test('outside a duel a hit taken keeps its full weight', (): void => {
  const event: WorldEvent = { type: 'damage', targetId: 1, sourceId: 2, targetTeam: 'player', amount: 25, crit: false, killed: false, pos: { x: 0, z: 0 }, direction: { x: 1, z: 0 }, skill: must(CONTENT.skills.get('cleave'), 'cleave'), burn: false, shoveGraced: false };
  const reward: number = rewardFor([event], { playerId: 1, playerMaxLife: 100, lifeOf: (): number => 100, calm: false, worth: (): number => 0 }, emptyTally());
  assert.equal(reward, -0.25 * REWARD.taken);
});
