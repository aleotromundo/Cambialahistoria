import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, SkillDef, ZoneDuel } from '../content/types.ts';
import { must, zoneOf } from '../../test/support.ts';
import { applyHit, offenceOf } from '../world/combat.ts';
import type { PlayerState, WorldEvent } from '../world/types.ts';
import type { Duel } from './duel.ts';
import { createDuel, duelRules } from './duel.ts';

const CONTENT: Content = loadContent();
const SEED: number = 41;

function struck(duel: Duel): number {
  const striker: PlayerState = must(duel.seats[0], 'first seat').hero;
  const target: PlayerState = must(duel.seats[1], 'second seat').hero;
  const skill: SkillDef = must(CONTENT.skills.get('cleave'), 'cleave');
  target.life = target.maxLife;
  duel.world.events = [];
  assert.ok(applyHit(duel.world, offenceOf(striker), target, skill, { x: 1, z: 0 }));
  return duel.world.events.reduce((sum: number, event: WorldEvent): number => sum + (event.type === 'damage' && event.targetId === target.id ? event.amount : 0), 0);
}

void test('a training duel fights under the duel rules of the content duel zone', (): void => {
  const proving: ZoneDuel = must(zoneOf(CONTENT, 'proving_ground').duel, 'proving ground duel');
  assert.deepEqual(duelRules(CONTENT), proving);
  const duel: Duel = createDuel(CONTENT, { seed: SEED, jitter: 0 });
  assert.equal(duel.world.zone.duel?.heroDamage, proving.heroDamage);
});

void test('one hero striking another in a training duel deals the duel zone share of the damage', (): void => {
  const scaled: Duel = createDuel(CONTENT, { seed: SEED, jitter: 0 });
  const full: Duel = createDuel(CONTENT, { seed: SEED, jitter: 0 });
  full.world.zone = { ...full.world.zone, duel: null };
  const heroDamage: number = must(duelRules(CONTENT), 'duel rules').heroDamage;
  const whole: number = struck(full);
  const share: number = struck(scaled);
  assert.ok(whole > 4);
  assert.ok(Math.abs(share - whole * heroDamage) <= 1, `${share} is not ${heroDamage} of ${whole}`);
});
