import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { must } from '../../test/support.ts';
import { ringContent, ringWorld } from '../../test/rival-support.ts';
import { stepWorld } from '../world/step.ts';
import type { Command, World } from '../world/types.ts';
import type { Action } from './contract.ts';
import type { RivalDuel, RivalPilot } from './rival.ts';
import { beginRivalDuel, RIVAL, rivalCommands, rivalHeard, startRivalDuel } from './rival.ts';

const CONTENT: Content = ringContent(loadContent());
const FRAME: number = 1 / 60;
const STRIKE: Action = { move: 0, skill: 1, target: 0, use: 0 };

function decisionsOver(world: World, duel: RivalDuel, seconds: number): number {
  let decisions: number = 0;
  const pilot: RivalPilot = (): Action => {
    decisions += 1;
    return STRIKE;
  };
  for (let time: number = 0; time < seconds; time += FRAME) {
    const commands: Command[] = rivalCommands(duel, world, pilot, FRAME);
    rivalHeard(duel, world, stepWorld(world, commands, FRAME));
  }
  return decisions;
}

void test('beginning a duel once the player can see it gives them the whole grace from then', (): void => {
  const world: World = ringWorld(CONTENT, 12, 10);
  const duel: RivalDuel = must(startRivalDuel(world, 12), 'duel');
  stepWorld(world, [], 3);
  beginRivalDuel(duel, world);
  assert.equal(decisionsOver(world, duel, RIVAL.startIn - 0.1), 0);
  assert.ok(decisionsOver(world, duel, 0.5) > 0);
  assert.equal(duel.outcome, 'fighting');
});
