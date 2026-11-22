import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn, zoneOf } from '../../test/support.ts';
import { RING, ringContent, ringWorld } from '../../test/rival-support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef, ZoneExit } from '../content/types.ts';
import type { RivalDuel } from '../rl/rival.ts';
import { rivalOf, startRivalDuel } from '../rl/rival.ts';
import { respawnPlayer } from './death.ts';
import { goThrough, openPortal, portalEndHere } from './portal.ts';
import { stepWorld } from './step.ts';
import type { PlayerState, World } from './types.ts';
import { travelThrough, townZone } from './zones.ts';

const CONTENT: Content = ringContent(loadContent());
const AWAY: string = 'hall_of_time';
const SEED: number = 11;

function wounded(world: World): World {
  world.player.life = Math.max(1, Math.round(world.player.maxLife * 0.2));
  world.player.mana = 0;
  return world;
}

function assertFull(world: World): void {
  assert.equal(world.player.life, world.player.maxLife);
  assert.equal(world.player.mana, world.player.stats.maxMana);
}

void test('the Hideout restores a hero who enters it, and the world says so in data', (): void => {
  assert.ok(townZone(CONTENT).restoresOnEntry);
  assert.ok(!zoneOf(CONTENT, AWAY).restoresOnEntry);
  const duelHome: ZoneDef = zoneOf(CONTENT, must(zoneOf(CONTENT, 'proving_ground').duel, 'duel').home.zone);
  assert.ok(duelHome.restoresOnEntry);
});

void test('a wounded hero who walks into the Hideout through a way stands there at full life and mana', (): void => {
  const world: World = wounded(worldIn(CONTENT, AWAY, SEED));
  const exit: ZoneExit = must(world.zone.exits.find((way: ZoneExit): boolean => way.to === townZone(CONTENT).id), 'way to the Hideout');
  travelThrough(world, exit);
  assert.equal(world.zone.id, townZone(CONTENT).id);
  assertFull(world);
});

void test('a wounded hero who steps through a portal home stands in the Hideout at full life and mana', (): void => {
  const world: World = worldIn(CONTENT, AWAY, SEED);
  openPortal(world, 2);
  wounded(world);
  goThrough(world, must(portalEndHere(world), 'portal'));
  assert.equal(world.zone.id, townZone(CONTENT).id);
  assertFull(world);
});

void test('a hero who walks into a zone that does not restore keeps the life they had', (): void => {
  const world: World = wounded(worldIn(CONTENT, townZone(CONTENT).id, SEED));
  const life: number = world.player.life;
  const exit: ZoneExit = must(world.zone.exits.find((way: ZoneExit): boolean => !zoneOf(CONTENT, way.to).restoresOnEntry), 'way out of the Hideout');
  travelThrough(world, exit);
  assert.equal(world.player.life, life);
  assert.equal(world.player.mana, 0);
});

void test('a duellist who times out wounded comes home at full life and mana', (): void => {
  const world: World = ringWorld(CONTENT, SEED, 8);
  must(startRivalDuel(world, SEED), 'duel');
  wounded(world);
  stepWorld(world, [{ type: 'leave_duel' }], 1 / 30);
  assert.equal(world.zone.id, RING.home.zone);
  assertFull(world);
});

void test('a duellist who won wounded comes home at full life and mana', (): void => {
  const world: World = ringWorld(CONTENT, SEED + 1, 8);
  const duel: RivalDuel = must(startRivalDuel(world, SEED + 1), 'duel');
  const rival: PlayerState = must(rivalOf(duel, world), 'rival');
  rival.alive = false;
  rival.life = 0;
  wounded(world);
  stepWorld(world, [{ type: 'leave_duel' }], 1 / 30);
  assert.equal(world.zone.id, RING.home.zone);
  assertFull(world);
});

void test('a duellist who fell comes home standing at full life and mana', (): void => {
  const world: World = ringWorld(CONTENT, SEED + 2, 8);
  must(startRivalDuel(world, SEED + 2), 'duel');
  world.player.alive = false;
  world.player.life = 0;
  world.player.mana = 0;
  stepWorld(world, [{ type: 'leave_duel' }], 1 / 30);
  assert.equal(world.zone.id, RING.home.zone);
  assert.ok(world.player.alive);
  assertFull(world);
});

void test('a hero who falls away and rises in the Hideout stands there at full life and mana', (): void => {
  const world: World = worldIn(CONTENT, AWAY, SEED);
  world.player.alive = false;
  world.player.life = 0;
  world.player.mana = 0;
  world.death = { killer: 'test', skill: 'test', elapsed: CONTENT.player.respawnDelay, xpLost: 0 };
  respawnPlayer(world, 'town');
  assert.equal(world.zone.id, townZone(CONTENT).id);
  assertFull(world);
});
