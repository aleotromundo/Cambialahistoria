import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, SkillDef, ZoneDef, ZonePack } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { isWalkable } from '../nav/grid.ts';
import { fightZones } from '../world/moments.ts';
import type { Command, MonsterState, WorldEvent } from '../world/types.ts';
import { must } from '../../test/support.ts';
import { commandsFor } from './act.ts';
import { SELF_FEATURES } from './contract.ts';
import { moveBucket } from './moves.ts';
import type { Observation, Seen } from './observe.ts';
import { hostileTo } from './observe.ts';
import { REWARD } from './reward.ts';
import type { Roam, RoamSeat, RoamStep } from './roam.ts';
import { afterRoamTick, createRoam, ROAM, roamObjective, roamObservation, roamRunning, roamZones, stepRoam } from './roam.ts';

const CONTENT: Content = loadContent();
const YARD = { id: 'roam_yard', copies: 3, decisions: 4000, hurt: 0.1, stranger: 990001 } as const;

function yardContent(): Content {
  const hall: ZoneDef = must(CONTENT.zones.get(must(fightZones(CONTENT)[0], 'a fight zone')), 'the fight zone');
  const packs: ZonePack[] = Array.from({ length: YARD.copies }, (): readonly ZonePack[] => hall.packs).flat();
  const small: [string, ZoneDef][] = [...CONTENT.zones].filter(([, zone]: [string, ZoneDef]): boolean => zone.packs.length < ROAM.minPacks);
  return { ...CONTENT, zones: new Map<string, ZoneDef>([...small, [YARD.id, { ...hall, id: YARD.id, packs }]]) };
}

const YARD_CONTENT: Content = yardContent();

function gap(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

function seat(roam: Roam, index: number): RoamSeat {
  return must(roam.seats[index], `seat ${index}`);
}

function solo(seed: number): Roam {
  return createRoam(YARD_CONTENT, { seed, jitter: 0, partner: false });
}

function pair(seed: number): Roam {
  return createRoam(YARD_CONTENT, { seed, jitter: 0, partner: true });
}

function quiet(roam: Roam): Roam {
  roam.world.monsters = [];
  return roam;
}

function walk(roam: Roam, one: RoamSeat): Command[] {
  const seen: Observation = roamObservation(roam, one);
  const aim: Vec2 = roamObjective(roam, one);
  return commandsFor(roam.world, { move: moveBucket({ x: aim.x - one.hero.pos.x, z: aim.z - one.hero.pos.z }), skill: 0, target: 0, use: 0 }, seen.view);
}

function walkToEnd(roam: Roam): void {
  for (let decision: number = 0; decision < YARD.decisions && roamRunning(roam); decision += 1) stepRoam(roam, roam.seats.map((one: RoamSeat): Command[] => walk(roam, one)));
}

function hurt(targetId: number, sourceId: number, team: 'player' | 'monster', amount: number): WorldEvent {
  const skill: SkillDef = must([...CONTENT.skills.values()][0], 'a skill');
  return { type: 'damage', targetId, sourceId, targetTeam: team, amount, crit: false, killed: false, pos: { x: 0, z: 0 }, direction: { x: 0, z: 1 }, skill, burn: false, shoveGraced: false };
}

function feature(seen: Observation, name: string): number {
  return seen.obs[SELF_FEATURES.indexOf(name)] ?? Number.NaN;
}

void test('a roam is offered only by zones with enough packs and no duel', (): void => {
  assert.deepEqual(roamZones(YARD_CONTENT).map((zone: ZoneDef): string => zone.id), [YARD.id]);
  assert.ok(roamZones(CONTENT).length > 1);
  assert.ok(roamZones(CONTENT).every((zone: ZoneDef): boolean => zone.duel === null && zone.packs.length >= ROAM.minPacks));
});

void test('the same seed builds the same roam', (): void => {
  const first: Roam = pair(21);
  const again: Roam = pair(21);
  assert.deepEqual(again.from, first.from);
  assert.deepEqual(again.goal, first.goal);
  assert.equal(again.level, first.level);
  assert.deepEqual(again.world.monsters.map((monster: MonsterState): [string, number, number] => [monster.def.id, monster.pos.x, monster.pos.z]), first.world.monsters.map((monster: MonsterState): [string, number, number] => [monster.def.id, monster.pos.x, monster.pos.z]));
  assert.deepEqual(seat(again, 1).hero.pos, seat(first, 1).hero.pos);
});

void test('a roam starts the hero on open ground, clear of foes, a walk away from its goal', (): void => {
  for (const seed of [31, 32, 33, 34]) {
    const roam: Roam = solo(seed);
    const world = roam.world;
    assert.equal(roam.zone, YARD.id);
    assert.deepEqual(world.player.pos, roam.from);
    assert.ok(isWalkable(world.grid, roam.from.x, roam.from.z));
    assert.ok(isWalkable(world.grid, roam.goal.x, roam.goal.z));
    assert.ok(roam.length >= ROAM.leg.min);
    assert.ok(world.monsters.length > 0);
    assert.ok(world.monsters.every((monster: MonsterState): boolean => !hostileTo(world, world.player, monster) || gap(monster.pos, roam.from) >= ROAM.clear));
    assert.ok(world.monsters.every((monster: MonsterState): boolean => gap(monster.pos, roam.from) <= roam.length + ROAM.keep));
    assert.equal(roam.timeLimit, ROAM.baseTime + roam.length * ROAM.timePerMetre);
  }
});

void test('the zone a roam stands in is set to the hero, with no surge and no packs coming back', (): void => {
  const roam: Roam = createRoam(YARD_CONTENT, { seed: 35, jitter: 0, partner: false, level: 9 });
  const zone: ZoneDef = roam.world.zone;
  assert.equal(roam.level, 9);
  assert.equal(roam.world.player.level, 9);
  assert.equal(zone.level, zone.levelUpTo);
  assert.ok(Math.abs(zone.level - 9) <= 2);
  assert.equal(zone.surge, null);
  assert.equal(zone.packReturn, null);
  assert.ok(zone.packs.every((pack: ZonePack): boolean => pack.level === undefined));
});

void test('the lead reads the roam situation, an objective on its way and how far along it is', (): void => {
  const roam: Roam = solo(36);
  const lead: RoamSeat = seat(roam, 0);
  const seen: Observation = roamObservation(roam, lead);
  assert.equal(feature(seen, 'situation_roam'), 1);
  assert.equal(feature(seen, 'situation_arena'), 0);
  assert.equal(feature(seen, 'objective_has'), 1);
  assert.equal(feature(seen, 'progress'), 0);
  assert.ok(seen.view.seen.some((one: Seen): boolean => one.type === 'objective'));
  assert.ok(gap(roamObjective(roam, lead), roam.goal) <= roam.length);
});

void test('a lead that walks its objective arrives, wins and is paid for the ground it covered', (): void => {
  const roam: Roam = quiet(solo(37));
  const lead: RoamSeat = seat(roam, 0);
  const first: RoamStep = stepRoam(roam, [walk(roam, lead)]);
  walkToEnd(roam);
  assert.equal(lead.outcome, 'won');
  assert.ok(gap(lead.hero.pos, roam.goal) <= ROAM.arrive);
  assert.ok((first.rewards[0] ?? 0) > -REWARD.step);
  assert.ok(lead.total > REWARD.win);
  assert.ok(lead.total < REWARD.win + roam.length * ROAM.progress * ROAM.detour);
});

void test('a roam nobody finishes runs out of time', (): void => {
  const roam: Roam = quiet(pair(38));
  for (let decision: number = 0; decision < YARD.decisions && roamRunning(roam); decision += 1) stepRoam(roam, [[], []]);
  assert.deepEqual(roam.seats.map((one: RoamSeat): string => one.outcome), ['timeout', 'timeout']);
  assert.ok(roam.world.time - roam.start >= roam.timeLimit);
});

void test('a partner stands beside the lead in its party, sees it as an ally and is sent to it', (): void => {
  const roam: Roam = pair(39);
  const [lead, partner] = [seat(roam, 0), seat(roam, 1)];
  assert.equal(lead.hero, roam.world.player);
  assert.equal(partner.hero.party, lead.hero.party);
  assert.notEqual(partner.hero.id, lead.hero.id);
  assert.ok(gap(partner.hero.pos, lead.hero.pos) <= ROAM.partnerGap + ROAM.partnerReach);
  const seen: Observation = roamObservation(roam, partner);
  assert.ok(!seen.view.targets.includes(lead.hero));
  assert.ok(seen.view.seen.some((one: Seen): boolean => one.type === 'hero' && one.hero === lead.hero && !one.hostile));
  assert.deepEqual(roamObjective(roam, partner), lead.hero.pos);
  assert.equal(feature(seen, 'situation_roam'), 1);
  assert.equal(feature(seen, 'progress'), 0);
});

void test('a partner is paid for staying beside the lead and charged for falling behind', (): void => {
  const near: Roam = quiet(pair(40));
  const beside: RoamStep = stepRoam(near, [[], []]);
  assert.ok(Math.abs((beside.rewards[1] ?? 0) - (ROAM.beside - REWARD.step)) < 1e-9);
  const apart: Roam = quiet(pair(40));
  seat(apart, 1).hero.pos = { x: apart.goal.x, z: apart.goal.z };
  const far: number = gap(apart.goal, apart.from);
  const behind: RoamStep = stepRoam(apart, [[], []]);
  assert.ok(far >= ROAM.far);
  assert.ok(Math.abs((behind.rewards[1] ?? 0) - (-ROAM.apart - REWARD.step)) < 1e-9);
});

void test('each hero is paid for its own blows, and a hurt partner costs the other a share', (): void => {
  const roam: Roam = pair(41);
  const lead: RoamSeat = seat(roam, 0);
  const foe: MonsterState = must(roam.world.monsters[0], 'a monster');
  const struck: number[] = [0, 0];
  afterRoamTick(roam, [hurt(foe.id, lead.hero.id, 'monster', foe.maxLife * YARD.hurt)], struck);
  assert.ok(Math.abs((struck[0] ?? 0) - YARD.hurt * REWARD.dealt) < 1e-9);
  assert.equal(struck[1], 0);
  const taken: number[] = [0, 0];
  afterRoamTick(roam, [hurt(lead.hero.id, YARD.stranger, 'player', lead.hero.maxLife * YARD.hurt)], taken);
  assert.ok(Math.abs((taken[0] ?? 0) + YARD.hurt * REWARD.taken) < 1e-9);
  assert.ok(Math.abs((taken[1] ?? 0) + YARD.hurt * REWARD.taken * ROAM.guard) < 1e-9);
});

void test('a fallen hero ends the roam for both, and the one left standing pays for it', (): void => {
  const roam: Roam = quiet(pair(42));
  const [lead, partner] = [seat(roam, 0), seat(roam, 1)];
  lead.hero.alive = false;
  const rewards: number[] = [0, 0];
  afterRoamTick(roam, [], rewards);
  assert.equal(lead.outcome, 'died');
  assert.equal(partner.outcome, 'timeout');
  assert.equal(rewards[1], -REWARD.death * ROAM.guard);
  assert.ok(!roamRunning(roam));
});

void test('a partner that keeps up arrives with the lead, and one left behind does not', (): void => {
  const together: Roam = quiet(pair(43));
  walkToEnd(together);
  assert.deepEqual(together.seats.map((one: RoamSeat): string => one.outcome), ['won', 'won']);
  const split: Roam = quiet(pair(43));
  const [lead, partner] = [seat(split, 0), seat(split, 1)];
  lead.hero.pos = { x: split.goal.x, z: split.goal.z };
  const rewards: number[] = [0, 0];
  afterRoamTick(split, [], rewards);
  assert.ok(gap(partner.hero.pos, lead.hero.pos) > ROAM.far);
  assert.equal(lead.outcome, 'won');
  assert.equal(partner.outcome, 'timeout');
  assert.equal(rewards[0], REWARD.win);
  assert.equal(rewards[1], 0);
});

void test('a roam refuses commands for the wrong number of seats', (): void => {
  assert.throws((): RoamStep => stepRoam(pair(44), [[]]), /2 seats/);
});
