import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GroundItem, WorldEvent } from '../world/types.ts';
import type { RewardTally } from './reward.ts';
import { emptyTally, REWARD, rewardFor } from './reward.ts';

const PLAYER: number = 1;

function picked(content: GroundItem['content']): WorldEvent {
  return { type: 'pickup', ground: { id: 40, pos: { x: 0, z: 0 }, from: { x: 0, z: 0 }, content, find: null, age: 0, kept: false } };
}

void test('gold picked up away from the fight pays a small bonus', (): void => {
  const tally: RewardTally = emptyTally();
  assert.equal(rewardFor([picked({ kind: 'gold', amount: 12 })], { playerId: PLAYER, playerMaxLife: 100, lifeOf: (): number => 100, calm: true }, tally), REWARD.gold);
  assert.equal(tally.gold, 1);
});

void test('gold picked up with a foe close by pays nothing', (): void => {
  const tally: RewardTally = emptyTally();
  assert.equal(rewardFor([picked({ kind: 'gold', amount: 12 })], { playerId: PLAYER, playerMaxLife: 100, lifeOf: (): number => 100, calm: false }, tally), 0);
  assert.equal(tally.gold, 0);
});
