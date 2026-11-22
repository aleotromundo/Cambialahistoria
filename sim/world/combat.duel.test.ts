import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, SkillDef, ZoneDef, ZoneDuel } from '../content/types.ts';
import { must, zoneOf } from '../../test/support.ts';
import { RING, ringContent, ringWorld } from '../../test/rival-support.ts';
import { rivalOf, startRivalDuel } from '../rl/rival.ts';
import type { RivalDuel } from '../rl/rival.ts';
import { applyHit, offenceOf } from './combat.ts';
import type { PlayerState, World, WorldEvent } from './types.ts';

const BASE: Content = ringContent(loadContent());
const SEED: number = 12;
const LEVEL: number = 20;

function scaled(heroDamage: number): Content {
  const ring: ZoneDef = zoneOf(BASE, RING.id);
  const duel: ZoneDuel = must(ring.duel, 'ring duel');
  return { ...BASE, zones: new Map<string, ZoneDef>([...BASE.zones, [RING.id, { ...ring, duel: { ...duel, heroDamage } }]]) };
}

function dealt(heroDamage: number, rivalStrikes: boolean): number {
  const content: Content = scaled(heroDamage);
  const world: World = ringWorld(content, SEED, LEVEL);
  const duel: RivalDuel = must(startRivalDuel(world, SEED), 'duel');
  const rival: PlayerState = must(rivalOf(duel, world), 'rival');
  const striker: PlayerState = rivalStrikes ? rival : world.player;
  const target: PlayerState = rivalStrikes ? world.player : rival;
  target.life = target.maxLife;
  const skill: SkillDef = must(content.skills.get('cleave'), 'cleave');
  world.events = [];
  assert.ok(applyHit(world, offenceOf(striker), target, skill, { x: 1, z: 0 }));
  return world.events.reduce((sum: number, event: WorldEvent): number => sum + (event.type === 'damage' && event.targetId === target.id ? event.amount : 0), 0);
}

void test('a duel scales the damage one hero deals another, both ways', (): void => {
  for (const rivalStrikes of [true, false]) {
    const full: number = dealt(1, rivalStrikes);
    const half: number = dealt(0.5, rivalStrikes);
    assert.ok(full > 4);
    assert.ok(Math.abs(half - full * 0.5) <= 1, `${half} is not half of ${full}`);
  }
});

void test('the Proving Ground fights at a reduced hero damage', (): void => {
  const duel: ZoneDuel = must(zoneOf(loadContent(), 'proving_ground').duel, 'proving ground duel');
  assert.equal(duel.gear, 'standard');
  assert.ok(duel.heroDamage < 1);
});
