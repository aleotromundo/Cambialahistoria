import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { must } from '../../test/support.ts';
import { ringContent, ringWorld } from '../../test/rival-support.ts';
import { stepWorld } from '../world/step.ts';
import type { Command, World, WorldEvent } from '../world/types.ts';
import { createPolicyNet } from './policy-net.ts';
import { readPolicyFile } from './policy-file.ts';
import type { RivalDuel, RivalPilot } from './rival.ts';
import { netPilot, RIVAL, rivalCommands, rivalHeard, rivalOf, startRivalDuel } from './rival.ts';

const SHIPPED: string = 'public/models/rl/duel-pilot.bin';
const FRAME: number = 1 / 30;
const CONTENT: Content = ringContent(loadContent());

void test('the shipped model drives the rival: it closes on the player or strikes within a few seconds', (): void => {
  const pilot: RivalPilot = netPilot(createPolicyNet(readPolicyFile(new Uint8Array(readFileSync(SHIPPED)))));
  const world: World = ringWorld(CONTENT, 21, 12);
  const duel: RivalDuel = must(startRivalDuel(world, 21), 'duel');
  const gap = (): number => {
    const hero = must(rivalOf(duel, world), 'rival');
    return Math.hypot(hero.pos.x - world.player.pos.x, hero.pos.z - world.player.pos.z);
  };
  const before: number = gap();
  const sent: Command[] = [];
  for (let time: number = 0; time < RIVAL.startIn + 4; time += FRAME) {
    const commands: Command[] = rivalCommands(duel, world, pilot, FRAME);
    sent.push(...commands);
    const events: WorldEvent[] = stepWorld(world, commands, FRAME);
    rivalHeard(duel, world, events);
  }
  assert.ok(sent.length > 0);
  assert.ok(gap() < before || sent.some((command: Command): boolean => command.type === 'skill') || world.player.life < world.player.maxLife, 'the rival neither closed in nor struck');
});
