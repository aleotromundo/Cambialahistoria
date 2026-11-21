import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Vector2 } from 'three';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import type { Action } from '../../sim/rl/contract.ts';
import { RIVAL } from '../../sim/rl/rival.ts';
import type { RivalPilot } from '../../sim/rl/rival.ts';
import { stepWorld } from '../../sim/world/step.ts';
import type { Command, World } from '../../sim/world/types.ts';
import { enterZone } from '../../sim/world/zones.ts';
import { RING, ringContent, ringWorld } from '../../test/rival-support.ts';
import { worldIn, zoneOf } from '../../test/support.ts';
import { CAMERA } from '../render/iso-camera.ts';
import type { LifeRow } from '../watch/duel-lives.ts';
import type { RivalCamera, RivalLivesView, RivalPlay } from './rival-play.ts';
import { createRivalPlay } from './rival-play.ts';

const CONTENT: Content = ringContent(loadContent());
const FRAME: number = 1 / 60;
const STRIKE: Action = { move: 0, skill: 1, target: 0, use: 0 };

interface Seen {
  readonly rows: LifeRow[][];
  readonly held: number[];
  readonly warnings: string[];
  closed: number;
}

interface Gate {
  readonly promise: Promise<RivalPilot>;
  open(pilot: RivalPilot): void;
  fail(reason: string): void;
}

interface Hands {
  open: (pilot: RivalPilot) => void;
  fail: (reason: Error) => void;
}

function gate(): Gate {
  const hands: Hands = { open: (): void => undefined, fail: (): void => undefined };
  const promise: Promise<RivalPilot> = new Promise<RivalPilot>((resolve: (pilot: RivalPilot) => void, reject: (reason: Error) => void): void => {
    hands.open = resolve;
    hands.fail = reject;
  });
  return { promise, open: (pilot: RivalPilot): void => hands.open(pilot), fail: (reason: string): void => hands.fail(new Error(reason)) };
}

function strike(): Action {
  return STRIKE;
}

function rig(world: World, loaded: Gate): { readonly play: RivalPlay; readonly seen: Seen } {
  const seen: Seen = { rows: [], held: [], warnings: [], closed: 0 };
  const lives: RivalLivesView = {
    show: (rows: readonly LifeRow[]): void => {
      seen.rows.push([...rows]);
    },
    place: (): void => undefined,
    cover: (): number => 0,
    close: (): void => {
      seen.closed += 1;
    },
  };
  const camera: RivalCamera = {
    holdDistance: (reach: number): void => {
      seen.held.push(reach);
    },
    project: (_x: number, _y: number, _z: number, out: Vector2): boolean => {
      out.set(0, 0);
      return true;
    },
  };
  const play: RivalPlay = createRivalPlay({ world, camera, lens: { aspect: 16 / 9, fov: 40 }, openLives: (): RivalLivesView => lives, pushFog: (): void => undefined, loadPilot: (): Promise<RivalPilot> => loaded.promise, seed: (): number => 21, warn: (message: string): void => void seen.warnings.push(message) });
  return { play, seen };
}

function run(world: World, play: RivalPlay, seconds: number): Command[] {
  const sent: Command[] = [];
  for (let time: number = 0; time < seconds; time += FRAME) {
    const commands: Command[] = play.commands(FRAME);
    sent.push(...commands);
    play.heard(stepWorld(world, commands, FRAME));
  }
  return sent;
}

function lastNames(seen: Seen): string[] {
  return (seen.rows.at(-1) ?? []).map((row: LifeRow): string => row.name);
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve: () => void): void => void setImmediate(resolve));
}

void test('outside a duel zone entering starts nothing', (): void => {
  const world: World = worldIn(CONTENT, 'hideout', 1);
  const { play, seen } = rig(world, gate());
  play.enter();
  play.show(true);
  assert.equal(world.heroes.length, 1);
  assert.equal(play.aim(FRAME), null);
  assert.deepEqual(seen.rows, []);
});

void test('the rival waits for the veil to lift and the model to load, then fights after its grace', async (): Promise<void> => {
  const world: World = ringWorld(CONTENT, 31, 10);
  const loaded: Gate = gate();
  const { play, seen } = rig(world, loaded);
  play.enter();
  assert.equal(world.heroes.length, 2);
  assert.deepEqual(run(world, play, 2), []);
  play.show(false);
  play.show(true);
  assert.deepEqual(run(world, play, 2), []);
  assert.deepEqual(seen.rows, []);
  loaded.open(strike);
  await settle();
  play.show(true);
  assert.deepEqual(lastNames(seen), ['You', 'Rival']);
  assert.deepEqual(run(world, play, RIVAL.startIn - 0.1), []);
  assert.ok(run(world, play, 1).length > 0);
});

void test('a model that will not load is said once, and the duel still begins with a rival that stands still', async (): Promise<void> => {
  const world: World = ringWorld(CONTENT, 32, 10);
  const loaded: Gate = gate();
  const { play, seen } = rig(world, loaded);
  play.enter();
  loaded.fail('gone');
  await settle();
  play.show(true);
  assert.equal(seen.warnings.length, 1);
  assert.equal(seen.rows.length, 1);
  const before: number = world.heroes[1]?.pos.x ?? 0;
  run(world, play, RIVAL.startIn + 1);
  assert.equal(world.heroes[1]?.pos.x, before);
});

void test('leaving the duel closes the bars and gives the camera back', async (): Promise<void> => {
  const world: World = ringWorld(CONTENT, 33, 10);
  const loaded: Gate = gate();
  const { play, seen } = rig(world, loaded);
  play.enter();
  loaded.open(strike);
  await settle();
  play.show(true);
  assert.notEqual(play.aim(FRAME), null);
  enterZone(world, zoneOf(CONTENT, RING.home.zone), { type: 'exit', exit: RING.home.exit }, true);
  play.enter();
  assert.equal(seen.closed, 1);
  assert.equal(seen.held.at(-1), CAMERA.distance);
  assert.equal(play.aim(FRAME), null);
  assert.deepEqual(play.commands(FRAME), []);
});
