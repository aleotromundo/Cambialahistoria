import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group } from 'three';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import { createWorld } from '../../sim/world/create.ts';
import type { MonsterState, World } from '../../sim/world/types.ts';
import { enterZone } from '../../sim/world/zones.ts';
import type { FramePacer } from './paced-work.ts';
import { BODY_RAISE, raiseBodies, raiseOrder } from './body-raise.ts';

const content: Content = loadContent();

interface ClockPacer extends FramePacer {
  readonly frames: number[];
  spend(ms: number): void;
}

function clockPacer(): ClockPacer {
  let clock: number = 0;
  let frame: number = 0;
  const frames: number[] = [];
  return {
    frames,
    now(): number {
      return clock;
    },
    next(): Promise<void> {
      frame += 1;
      clock += 16;
      return Promise.resolve();
    },
    spend(ms: number): void {
      clock += ms;
      frames.push(frame);
    },
  };
}

function underHall(): World {
  const world: World = createWorld(content, { seed: 7, save: null, opening: true });
  enterZone(world, must(content.zones.get('under_hall'), 'under_hall'), { type: 'start' });
  return world;
}

function away(monster: MonsterState, world: World): number {
  return Math.hypot(monster.pos.x - world.player.pos.x, monster.pos.z - world.player.pos.z);
}

void test('bodies are raised nearest the hero first, and only for the living', (): void => {
  const world: World = underHall();
  const fallen: MonsterState = must(world.monsters[0], 'a monster');
  fallen.alive = false;
  const order: MonsterState[] = raiseOrder(world.monsters, world.player.pos);
  assert.equal(order.length, world.monsters.length - 1);
  assert.ok(!order.includes(fallen));
  order.forEach((monster: MonsterState, index: number): void => {
    const before: MonsterState | undefined = order[index - 1];
    if (before !== undefined) assert.ok(away(before, world) <= away(monster, world));
  });
});

void test('every live monster of the largest cave gets a body, spread over frames within the budget', async (): Promise<void> => {
  const world: World = underHall();
  const pacer: ClockPacer = clockPacer();
  const raised: Map<number, Group> = new Map<number, Group>();
  const costMs: number = 3;
  const body = (monster: MonsterState): Group => {
    const made: Group = new Group();
    raised.set(monster.id, made);
    pacer.spend(costMs);
    return made;
  };
  await raiseBodies(world, { body, pacer, live: (): boolean => true });
  const live: MonsterState[] = world.monsters.filter((monster: MonsterState): boolean => monster.alive);
  assert.ok(live.length > 100);
  assert.equal(raised.size, live.length);
  for (const monster of live) {
    const made: Group = must(raised.get(monster.id), `the body of #${monster.id}`);
    assert.equal(made.position.x, monster.pos.x);
    assert.equal(made.position.z, monster.pos.z);
  }
  const perFrame: Map<number, number> = new Map<number, number>();
  for (const frame of pacer.frames) perFrame.set(frame, (perFrame.get(frame) ?? 0) + 1);
  assert.ok(perFrame.size > 1);
  assert.ok([...perFrame.values()].every((count: number): boolean => count <= Math.ceil(BODY_RAISE.budgetMs / costMs)));
});

void test('raising stops the moment the zone it was for is left', async (): Promise<void> => {
  const world: World = underHall();
  const pacer: ClockPacer = clockPacer();
  const raised: number[] = [];
  let here: boolean = true;
  const body = (monster: MonsterState): null => {
    raised.push(monster.id);
    pacer.spend(BODY_RAISE.budgetMs);
    if (raised.length === 3) here = false;
    return null;
  };
  await raiseBodies(world, { body, pacer, live: (): boolean => here });
  assert.equal(raised.length, 3);
});
