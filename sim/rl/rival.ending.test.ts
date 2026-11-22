import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { must } from '../../test/support.ts';
import { RING, ringContent, ringWorld } from '../../test/rival-support.ts';
import { stepWorld } from '../world/step.ts';
import type { Command, PlayerState, World } from '../world/types.ts';
import type { Action } from './contract.ts';
import { NO_ACTION } from './contract.ts';
import { DUEL } from './duel.ts';
import { observe } from './observe.ts';
import type { RivalDuel, RivalPilot } from './rival.ts';
import { RIVAL, resignRivalDuel, rivalCommands, rivalContext, rivalHeard, rivalOf, startRivalDuel } from './rival.ts';

const CONTENT: Content = ringContent(loadContent());
const FRAME: number = 1 / 60;
const STILL: RivalPilot = (): Action => NO_ACTION;

function play(world: World, duel: RivalDuel, seconds: number): Command[] {
  const sent: Command[] = [];
  for (let time: number = 0; time < seconds; time += FRAME) {
    const commands: Command[] = rivalCommands(duel, world, STILL, FRAME);
    sent.push(...commands);
    rivalHeard(duel, world, stepWorld(world, commands, FRAME));
  }
  return sent;
}

void test('a duel has no clock: nobody is sent home however long the heroes stand apart', (): void => {
  const world: World = ringWorld(CONTENT, 31, 12);
  const duel: RivalDuel = must(startRivalDuel(world, 31), 'duel');
  world.time = duel.start + DUEL.timeLimit * 3;
  rivalHeard(duel, world, []);
  assert.equal(duel.outcome, 'fighting');
  assert.equal(duel.endedAt, null);
  assert.deepEqual(play(world, duel, RIVAL.holdAfter + 0.5), []);
  assert.equal(duel.outcome, 'fighting');
  assert.equal(world.zone.id, RING.id);
});

void test('the rival always reads a full clock, the one it saw at the start of every training duel', (): void => {
  const world: World = ringWorld(CONTENT, 32, 12);
  const duel: RivalDuel = must(startRivalDuel(world, 32), 'duel');
  assert.equal(rivalContext(duel, world).timeLeft, DUEL.timeLimit);
  world.time = duel.start + DUEL.timeLimit * 2;
  assert.equal(rivalContext(duel, world).timeLeft, DUEL.timeLimit);
  const rival: PlayerState = must(rivalOf(duel, world), 'rival');
  const early: Float32Array = observe(world, rivalContext(duel, world), rival).obs;
  world.time += DUEL.timeLimit;
  assert.deepEqual(observe(world, rivalContext(duel, world), rival).obs, early);
});

void test('resigning ends the duel as a loss and sends the player home, alive, once the verdict has been read', (): void => {
  const world: World = ringWorld(CONTENT, 33, 12);
  const duel: RivalDuel = must(startRivalDuel(world, 33), 'duel');
  world.player.xp = 40;
  play(world, duel, RIVAL.startIn + 1);
  assert.equal(resignRivalDuel(duel, world), true);
  assert.equal(duel.outcome, 'resigned');
  assert.equal(duel.endedAt, world.time);
  rivalHeard(duel, world, []);
  assert.equal(duel.outcome, 'resigned');
  assert.deepEqual(play(world, duel, RIVAL.holdAfter - 0.2), []);
  assert.equal(world.zone.id, RING.id);
  assert.deepEqual(play(world, duel, 0.5), [{ type: 'leave_duel' }]);
  assert.equal(world.zone.id, RING.home.zone);
  assert.ok(world.player.alive);
  assert.equal(world.player.xp, 40);
});

void test('a duel already decided cannot be resigned', (): void => {
  const world: World = ringWorld(CONTENT, 34, 12);
  const duel: RivalDuel = must(startRivalDuel(world, 34), 'duel');
  world.player.alive = false;
  rivalHeard(duel, world, []);
  assert.equal(duel.outcome, 'lost');
  const ended: number | null = duel.endedAt;
  world.time += 1;
  assert.equal(resignRivalDuel(duel, world), false);
  assert.equal(duel.outcome, 'lost');
  assert.equal(duel.endedAt, ended);
});
