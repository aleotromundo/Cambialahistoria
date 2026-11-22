import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Vector2 } from 'three';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import type { Action } from '../../sim/rl/contract.ts';
import { NO_ACTION } from '../../sim/rl/contract.ts';
import { DUEL } from '../../sim/rl/duel.ts';
import { RIVAL } from '../../sim/rl/rival.ts';
import type { RivalPilot } from '../../sim/rl/rival.ts';
import { stepWorld } from '../../sim/world/step.ts';
import type { Command, World } from '../../sim/world/types.ts';
import { RING, ringContent, ringWorld } from '../../test/rival-support.ts';
import type { ScreenBox } from '../watch/duel-frame.ts';
import type { RivalCamera, RivalHud, RivalLivesView, RivalPlay } from './rival-play.ts';
import { createRivalPlay } from './rival-play.ts';

const CONTENT: Content = ringContent(loadContent());
const FRAME: number = 1 / 60;

interface Seen {
  readonly resignable: boolean[];
  readonly verdicts: (string | null)[];
  readonly looks: number[];
  resign: () => void;
}

function standStill(): Action {
  return NO_ACTION;
}

function rig(world: World): { readonly play: RivalPlay; readonly seen: Seen } {
  const seen: Seen = { resignable: [], verdicts: [], looks: [], resign: (): void => undefined };
  const lives: RivalLivesView = {
    show: (_rows: unknown, verdict: string | null): void => void seen.verdicts.push(verdict),
    place: (): void => undefined,
    cover: (): number => 0,
    close: (): void => undefined,
  };
  const hud = (resign: () => void): RivalHud => {
    seen.resign = resign;
    return {
      covers: (): readonly ScreenBox[] => {
        seen.looks.push(world.time);
        return [];
      },
      resignable: (shown: boolean): void => void seen.resignable.push(shown),
    };
  };
  const camera: RivalCamera = {
    holdDistance: (): void => undefined,
    project: (_x: number, _y: number, _z: number, out: Vector2): boolean => {
      out.set(0, 0);
      return true;
    },
  };
  const play: RivalPlay = createRivalPlay({ world, camera, lens: { aspect: 16 / 9, fov: 40 }, openLives: (): RivalLivesView => lives, openHud: hud, pushFog: (): void => undefined, loadPilot: (): Promise<RivalPilot> => Promise.resolve(standStill), seed: (): number => 41, warn: (): void => undefined });
  return { play, seen };
}

function run(world: World, play: RivalPlay, seconds: number): Command[] {
  const sent: Command[] = [];
  for (let time: number = 0; time < seconds; time += FRAME) {
    const commands: Command[] = play.commands(FRAME);
    sent.push(...commands);
    play.heard(stepWorld(world, commands, FRAME));
    play.aim(FRAME);
    play.show(true);
  }
  return sent;
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve: () => void): void => void setImmediate(resolve));
}

async function begun(world: World): Promise<{ readonly play: RivalPlay; readonly seen: Seen }> {
  const made: { readonly play: RivalPlay; readonly seen: Seen } = rig(world);
  made.play.enter();
  await settle();
  made.play.show(true);
  return made;
}

void test('the Resign control shows once the duel begins and the duel outlasts the old clock', async (): Promise<void> => {
  const world: World = ringWorld(CONTENT, 41, 10);
  const { play, seen } = await begun(world);
  assert.equal(seen.resignable.at(-1), true);
  run(world, play, DUEL.timeLimit + 5);
  assert.equal(world.zone.id, RING.id);
  assert.equal(seen.resignable.at(-1), true);
  assert.equal(seen.verdicts.at(-1), null);
});

void test('resigning ends the duel as a loss, hides the control and sends the player home', async (): Promise<void> => {
  const world: World = ringWorld(CONTENT, 42, 10);
  const { play, seen } = await begun(world);
  run(world, play, RIVAL.startIn + 0.5);
  play.resign();
  run(world, play, FRAME);
  assert.equal(seen.resignable.at(-1), false);
  assert.equal(seen.verdicts.at(-1), 'You resigned');
  const sent: Command[] = run(world, play, RIVAL.holdAfter + 0.5);
  assert.deepEqual(sent, [{ type: 'leave_duel' }]);
  assert.equal(world.zone.id, RING.home.zone);
  assert.ok(world.player.alive);
});

void test('a blocking transition over the duel hides the control, and it comes back when the transition ends', async (): Promise<void> => {
  const world: World = ringWorld(CONTENT, 45, 10);
  const { play, seen } = await begun(world);
  play.show(false);
  assert.equal(seen.resignable.at(-1), false);
  play.show(true);
  assert.equal(seen.resignable.at(-1), true);
});

void test('the control the HUD was handed resigns too, and resigning before the veil lifts does nothing', async (): Promise<void> => {
  const world: World = ringWorld(CONTENT, 43, 10);
  const made: { readonly play: RivalPlay; readonly seen: Seen } = rig(world);
  made.play.enter();
  made.seen.resign();
  made.play.show(false);
  assert.equal(made.seen.verdicts.length, 0);
  await settle();
  made.play.show(true);
  assert.equal(made.seen.verdicts.at(-1), null);
  made.seen.resign();
  made.play.show(true);
  assert.equal(made.seen.verdicts.at(-1), 'You resigned');
});

void test('the HUD covers are read only once the veil has lifted', async (): Promise<void> => {
  const world: World = ringWorld(CONTENT, 44, 10);
  const made: { readonly play: RivalPlay; readonly seen: Seen } = rig(world);
  made.play.enter();
  made.play.aim(FRAME);
  assert.deepEqual(made.seen.looks, []);
  await settle();
  made.play.show(true);
  made.play.aim(FRAME);
  assert.equal(made.seen.looks.length, 1);
});
