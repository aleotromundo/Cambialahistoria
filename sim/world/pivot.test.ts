import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dummy, offset, shapeArena, shapeSkill, SHAPE_DT } from '../../test/shape-support.ts';
import type { Vec2 } from '../math.ts';
import { facingOf } from '../math.ts';
import { angleBetween } from './movement.ts';
import { facesAim, needsPivot, TURNING } from './pivot.ts';
import { stepWorld } from './step.ts';
import type { MonsterState, World, WorldEvent } from './types.ts';

const LIMIT = 240;

function started(events: readonly WorldEvent[]): boolean {
  return events.some((event: WorldEvent): boolean => event.type === 'skill_start');
}

function heroStarted(world: World, events: readonly WorldEvent[]): boolean {
  return events.some((event: WorldEvent): boolean => event.type === 'skill_start' && event.actorId === world.player.id);
}

function castBehind(ids: readonly string[]): World {
  const world: World = shapeArena(ids);
  world.player.pos = offset(0, 0);
  world.player.facing = 0;
  return world;
}

function ticksToStart(world: World): number {
  for (let step: number = 1; step <= LIMIT; step += 1) if (started(stepWorld(world, [], SHAPE_DT))) return step;
  return Number.POSITIVE_INFINITY;
}

void test('a swing aimed behind the hero waits while he turns at his turn rate, then starts facing its aim', (): void => {
  const world: World = castBehind(['cleave']);
  const aim: Vec2 = offset(0, -3);
  const events: WorldEvent[] = stepWorld(world, [{ type: 'skill', slot: 0, aim, targetId: null }], SHAPE_DT);
  assert.equal(started(events), false);
  assert.notEqual(world.player.pivot, null);
  const turnedFirst: number = Math.abs(angleBetween(0, world.player.facing));
  assert.ok(turnedFirst > 0 && turnedFirst <= world.content.player.turnRate * SHAPE_DT + 1e-9, `turned ${turnedFirst} in the first tick`);
  const ticks: number = ticksToStart(world) + 1;
  const expected: number = (Math.PI - TURNING.castCone) / world.content.player.turnRate;
  assert.ok(Math.abs(ticks * SHAPE_DT - expected) <= SHAPE_DT * 2, `started after ${ticks * SHAPE_DT} s, expected about ${expected} s`);
  assert.equal(world.player.pivot, null);
  const want: number = facingOf({ x: aim.x - world.player.pos.x, z: aim.z - world.player.pos.z });
  assert.ok(Math.abs(angleBetween(world.player.facing, want)) < 1e-6);
});

void test('a swing at what the hero already faces starts on the same frame', (): void => {
  const world: World = castBehind(['cleave']);
  assert.equal(started(stepWorld(world, [{ type: 'skill', slot: 0, aim: offset(0, 3), targetId: null }], SHAPE_DT)), true);
  assert.equal(world.player.pivot, null);
});

void test('a roll and a burst around the hero start on the same frame whichever way he faces', (): void => {
  assert.equal(facesAim(shapeSkill('dodge_roll').delivery), false);
  assert.equal(facesAim(shapeSkill('thunderclap').delivery), false);
  for (const id of ['dodge_roll', 'thunderclap']) {
    const world: World = castBehind([id]);
    assert.equal(started(stepWorld(world, [{ type: 'skill', slot: 0, aim: offset(0, -3), targetId: null }], SHAPE_DT)), true, id);
  }
});

void test('a move while the hero turns toward a cast drops the cast', (): void => {
  const world: World = castBehind(['cleave']);
  stepWorld(world, [{ type: 'skill', slot: 0, aim: offset(0, -3), targetId: null }], SHAPE_DT);
  stepWorld(world, [{ type: 'move', held: false, dest: offset(3, 0) }], SHAPE_DT);
  assert.equal(world.player.pivot, null);
  assert.equal(ticksToStart(world), Number.POSITIVE_INFINITY);
});

void test('a later swing at a foe out of reach drops the turn toward an earlier aim, so the earlier swing never starts', (): void => {
  const world: World = castBehind(['cleave']);
  stepWorld(world, [{ type: 'skill', slot: 0, aim: offset(0, -3), targetId: null }], SHAPE_DT);
  assert.notEqual(world.player.pivot, null);
  const far: MonsterState = dummy(world, offset(12, 0));
  stepWorld(world, [{ type: 'skill', slot: 0, aim: far.pos, targetId: far.id }], SHAPE_DT);
  assert.equal(world.player.pivot, null);
  const turnTime: number = Math.PI / world.content.player.turnRate;
  for (let step: number = 0; step * SHAPE_DT < turnTime * 2; step += 1) assert.equal(heroStarted(world, stepWorld(world, [], SHAPE_DT)), false);
});

void test('the cast cone decides whether a turn comes first', (): void => {
  const world: World = castBehind(['cleave']);
  const cleave = shapeSkill('cleave');
  const inside: number = TURNING.castCone * 0.9;
  const outside: number = TURNING.castCone * 1.1;
  assert.equal(needsPivot(world.player, cleave, { x: Math.sin(inside), z: Math.cos(inside) }), false);
  assert.equal(needsPivot(world.player, cleave, { x: Math.sin(outside), z: Math.cos(outside) }), true);
  assert.equal(needsPivot(world.player, cleave, { x: 0, z: 0 }), false);
});

void test('walking turns the hero no faster than his walking turn rate', (): void => {
  const world: World = castBehind([]);
  let fastest: number = 0;
  for (let step: number = 0; step < 60; step += 1) {
    const before: number = world.player.facing;
    stepWorld(world, [{ type: 'move', held: true, dest: offset(0, -6) }], SHAPE_DT);
    fastest = Math.max(fastest, Math.abs(angleBetween(before, world.player.facing)) / SHAPE_DT);
  }
  assert.ok(fastest > 0);
  assert.ok(fastest <= world.content.player.walkTurnRate + 1e-6, `turned at ${fastest} rad/s`);
});
