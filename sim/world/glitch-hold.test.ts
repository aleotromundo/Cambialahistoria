import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arena, ARENA_CENTRE, place } from '../../test/arena-support.ts';
import { loadContent } from '../content/content.ts';
import { facingOf } from '../math.ts';
import { createWorld } from './create.ts';
import { heldCommands, inMist, requestGlitch, stepGlitch } from './glitch.ts';
import { attacksHeld, stillHero, worldly } from './glitch-hold.ts';
import type { SeamPhase } from './seam.ts';
import { stepWorld } from './step.ts';
import type { MonsterState, World } from './types.ts';

const DT: number = 1 / 30;

function fight(seed: number): { readonly world: World; readonly thrall: MonsterState } {
  const world: World = arena(seed);
  const thrall: MonsterState = place(world, 'mended', { x: ARENA_CENTRE.x + 1.4, z: ARENA_CENTRE.z });
  return { world, thrall };
}

function run(world: World, seconds: number): void {
  for (let step: number = 0; step < Math.round(seconds / DT); step += 1) stepWorld(world, [], DT);
}

function untilPhase(world: World, phase: SeamPhase): void {
  for (let step: number = 0; step < 600 && world.glitch.active?.phase !== phase; step += 1) stepWorld(world, [], DT);
  assert.equal(world.glitch.active?.phase, phase);
}

void test('attacks are held exactly until the glitch hold runs out', (): void => {
  const world: World = createWorld(loadContent(), { seed: 1, save: null });
  assert.equal(attacksHeld(world), false);
  world.glitch.holdUntil = world.time + 1;
  assert.equal(attacksHeld(world), true);
  world.time += 1;
  assert.equal(attacksHeld(world), false);
});

void test('walking and the commands that change nothing in the world are not worldly, and everything that acts on the world is', (): void => {
  assert.equal(worldly({ type: 'move', held: false, dest: { x: 1, z: 1 } }), false);
  assert.equal(worldly({ type: 'walk', held: true, dest: { x: 1, z: 1 } }), false);
  assert.equal(worldly({ type: 'stop' }), false);
  assert.equal(worldly({ type: 'skill', slot: 0, aim: { x: 1, z: 1 }, targetId: null }), true);
  assert.equal(worldly({ type: 'pickup', groundId: 1 }), true);
});

void test('stilling a hero who stands clears a worldly order he had queued and leaves a queued walk', (): void => {
  const { world } = fight(9);
  const walk = { type: 'move', held: false, dest: { x: 2, z: 2 } } as const;
  world.player.queued = walk;
  stillHero(world);
  assert.deepEqual(world.player.queued, walk);
  assert.equal(world.player.intent.type, 'idle');
  world.player.queued = { type: 'pickup', groundId: 1 };
  stillHero(world);
  assert.equal(world.player.queued, null);
});

void test('in the build-up the hero keeps control; from the tear he still walks where he is sent, and every other worldly command is dropped', (): void => {
  const { world } = fight(9);
  world.monsters = [];
  requestGlitch(world, 'hard_cut', 'debug');
  stepWorld(world, [], DT);
  assert.equal(world.glitch.active?.phase, 'build_up');
  const command = { type: 'move', held: false, dest: { x: 2, z: 2 } } as const;
  assert.deepEqual(heldCommands(world, [command]), [command]);
  untilPhase(world, 'tear');
  const before = { ...world.player.pos };
  const walk = { type: 'walk', held: true, dest: { x: 2, z: 2 } } as const;
  assert.deepEqual(heldCommands(world, [command, walk, { type: 'skill', slot: 0, aim: { x: 2, z: 2 }, targetId: null }, { type: 'pickup', groundId: 1 }, { type: 'stop' }]), [command, walk, { type: 'stop' }]);
  untilPhase(world, 'mist');
  stepWorld(world, [{ type: 'move', held: false, dest: { x: before.x + 6, z: before.z } }], DT);
  run(world, 0.6);
  assert.equal(inMist(world), true);
  assert.ok(world.player.pos.x - before.x > 1);
});

void test('a hero who walks into the tear keeps walking through the mist, and one who stands is left standing', (): void => {
  const { world } = fight(9);
  world.monsters = [];
  requestGlitch(world, 'hard_cut', 'debug');
  run(world, world.glitch.def.seam.buildUp - 0.2);
  assert.equal(world.glitch.active?.phase, 'build_up');
  const from = { ...world.player.pos };
  stepWorld(world, [{ type: 'move', held: false, dest: { x: from.x + 6, z: from.z } }], DT);
  untilPhase(world, 'tear');
  assert.equal(world.player.intent.type, 'move');
  const atTear = { ...world.player.pos };
  untilPhase(world, 'mist');
  run(world, 0.3);
  assert.equal(inMist(world), true);
  assert.ok(world.player.pos.x - atTear.x > 1);
  const standing = fight(9).world;
  standing.monsters = [];
  requestGlitch(standing, 'hard_cut', 'debug');
  untilPhase(standing, 'mist');
  assert.equal(standing.player.intent.type, 'idle');
});

void test('a hero who is walking as the tear back begins is not turned round', (): void => {
  const { world } = fight(10);
  world.monsters = [];
  world.glitch.progress = 0;
  requestGlitch(world, 'hard_cut', 'debug');
  untilPhase(world, 'mist');
  assert.equal(world.glitch.active?.edit, 'hero_turn');
  run(world, 1.2);
  assert.equal(world.glitch.active.phase, 'mist');
  const from = { ...world.player.pos };
  stepWorld(world, [{ type: 'move', held: false, dest: { x: from.x + 6, z: from.z } }], DT);
  untilPhase(world, 'tear_back');
  assert.equal(world.player.intent.type, 'move');
  run(world, 0.1);
  assert.ok(Math.cos(world.player.facing - facingOf({ x: 1, z: 0 })) > 0.9);
});

void test('a panel opened in the mist does not turn a walking hero round', (): void => {
  const { world } = fight(10);
  world.monsters = [];
  world.glitch.progress = 0;
  requestGlitch(world, 'hard_cut', 'debug');
  untilPhase(world, 'mist');
  assert.equal(world.glitch.active?.edit, 'hero_turn');
  const from = { ...world.player.pos };
  stepWorld(world, [{ type: 'move', held: false, dest: { x: from.x + 6, z: from.z } }], DT);
  run(world, 0.3);
  stepWorld(world, [{ type: 'overlay', open: true }], DT);
  assert.equal(world.glitch.active, null);
  assert.equal(world.player.intent.type, 'move');
  assert.ok(Math.cos(world.player.facing - facingOf({ x: 1, z: 0 })) > 0.9);
});

void test('the mist keeps a walk the player queued behind a skill, and drops a queued skill', (): void => {
  const { world } = fight(9);
  world.monsters = [];
  const at = { ...world.player.pos };
  const cast = { type: 'skill', slot: 0, aim: { x: at.x + 3, z: at.z }, targetId: null } as const;
  const walk = { type: 'move', held: false, dest: { x: at.x + 6, z: at.z } } as const;
  stepWorld(world, [cast], DT);
  assert.notEqual(world.player.action, null);
  world.player.queued = walk;
  requestGlitch(world, 'quiet_pass', 'debug');
  stepGlitch(world, DT);
  assert.equal(inMist(world), true);
  assert.deepEqual(world.player.queued, walk);
  run(world, 1.5);
  assert.ok(world.player.pos.x - at.x > 1);
  const other: World = fight(9).world;
  other.monsters = [];
  stepWorld(other, [cast], DT);
  other.player.queued = cast;
  requestGlitch(other, 'quiet_pass', 'debug');
  stepGlitch(other, DT);
  assert.equal(inMist(other), true);
  assert.equal(other.player.queued, null);
});
