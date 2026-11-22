import type { Content, ZoneDef, ZonePack } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import type { NavGrid } from '../nav/grid.ts';
import { copyGrid, lineWalkable, nearestWalkable } from '../nav/grid.ts';
import { zoneGrid } from '../nav/marker-bodies.ts';
import { findPath, nearestReached, reachFrom } from '../nav/path.ts';
import type { Rng } from '../rng.ts';
import { createRng } from '../rng.ts';
import { createWorld } from '../world/create.ts';
import { findHero } from '../world/heroes.ts';
import { spawnPacks } from '../world/monsters.ts';
import { stepWorld } from '../world/step.ts';
import type { ZoneCache } from '../zone-cache.ts';
import { zoneCache } from '../zone-cache.ts';
import type { Command, GroundItem, MonsterState, PlayerState, World, WorldEvent } from '../world/types.ts';
import type { ArenaOutcome } from './arena.ts';
import { ARENA, benchHero, jitterContent } from './arena.ts';
import type { Build } from './build.ts';
import { BUILD } from './build.ts';
import { readyBuild } from './build-hero.ts';
import { RL } from './contract.ts';
import { benchedRival } from './duel.ts';
import { DUEL_KIT } from './kit.ts';
import type { PickupRule } from './loot.ts';
import { rollRule, worth } from './loot.ts';
import type { Observation, ObserveContext } from './observe.ts';
import { hostileTo, observe, seenMonsters } from './observe.ts';
import type { Recall } from './recall.ts';
import { createRecall, noteSeen, recallEvents } from './recall.ts';
import type { RewardTally } from './reward.ts';
import { emptyTally, REWARD, rewardFor } from './reward.ts';

export const ROAM = {
  minPacks: 10,
  zonesHeld: 16,
  leg: { min: 9, max: 20 },
  detour: 2,
  routeTries: 32,
  spotReach: 6,
  clear: 7,
  keep: 26,
  arrive: 2.5,
  baseTime: 40,
  timePerMetre: 2,
  repath: 8,
  reached: 1.5,
  progress: 0.05,
  progressCap: 3,
  leash: 8,
  far: 16,
  beside: 0.004,
  apart: 0.004,
  guard: 0.5,
  together: 1.5,
  partnerGap: 2.5,
  partnerReach: 3,
  partnerSeed: 15487469,
} as const;

export const ROAM_ROLES = ['lead', 'partner'] as const;
export type RoamRole = (typeof ROAM_ROLES)[number];

export interface RoamOptions {
  readonly seed: number;
  readonly jitter: number;
  readonly partner: boolean;
  readonly zone?: string;
  readonly level?: number;
  readonly builds?: readonly (Build | null)[];
}

export interface RoamSeat {
  readonly role: RoamRole;
  readonly hero: PlayerState;
  readonly recall: Recall;
  readonly tally: RewardTally;
  readonly pickup: PickupRule;
  path: Vec2[];
  pathAge: number;
  left: number;
  outcome: ArenaOutcome;
  total: number;
}

export interface Roam {
  readonly options: RoamOptions;
  readonly world: World;
  readonly seats: readonly RoamSeat[];
  readonly level: number;
  readonly zone: string;
  readonly from: Vec2;
  readonly goal: Vec2;
  readonly length: number;
  readonly timeLimit: number;
  readonly start: number;
  decisions: number;
}

export interface RoamStep {
  readonly rewards: readonly number[];
  readonly done: boolean;
  readonly events: readonly WorldEvent[];
}

interface Ground {
  readonly grid: NavGrid;
  readonly reach: Uint8Array;
}

interface Levels {
  readonly byLevel: Map<number, ZoneDef>;
}

interface Route {
  readonly from: Vec2;
  readonly goal: Vec2;
  readonly path: readonly Vec2[];
  readonly length: number;
}

const GROUNDS: ZoneCache<Ground> = zoneCache<Ground>('roam grounds', { most: ROAM.zonesHeld });
const LEVELLED: ZoneCache<Levels> = zoneCache<Levels>('roam levels', { most: ROAM.zonesHeld });

function gap(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

export function roamZones(content: Content): ZoneDef[] {
  return [...content.zones.values()].filter((zone: ZoneDef): boolean => zone.duel === null && zone.packs.length >= ROAM.minPacks);
}

function groundOf(content: Content, zone: ZoneDef): Ground {
  const known: Ground | undefined = GROUNDS.get(zone);
  if (known !== undefined) return known;
  const grid: NavGrid = zoneGrid(content, zone);
  const ground: Ground = { grid, reach: reachFrom(grid, zone.playerStart) };
  GROUNDS.set(zone, ground);
  return ground;
}

function unlevelled(pack: ZonePack): ZonePack {
  return { x: pack.x, z: pack.z, members: pack.members, when: pack.when, ...(pack.row === undefined ? {} : { row: pack.row }), ...(pack.waits === undefined ? {} : { waits: pack.waits }), ...(pack.rank === undefined ? {} : { rank: pack.rank }) };
}

function levelled(zone: ZoneDef, level: number): ZoneDef {
  const known: Levels = LEVELLED.get(zone) ?? { byLevel: new Map<number, ZoneDef>() };
  LEVELLED.set(zone, known);
  const made: ZoneDef = known.byLevel.get(level) ?? { ...zone, level, levelUpTo: level, surge: null, moments: null, packReturn: null, packs: zone.packs.map(unlevelled) };
  known.byLevel.set(level, made);
  return made;
}

function roamWorld(content: Content, zone: ZoneDef, seed: number, level: number): World {
  const world: World = createWorld(content, { seed, save: null, opening: false });
  world.zone = levelled(zone, level);
  world.grid = copyGrid(groundOf(content, zone).grid);
  world.monsters = [];
  world.npcs = [];
  world.moments = [];
  world.encounters = [];
  world.packReturns = [];
  world.spawnedPacks = [];
  world.roused = [];
  world.wards = [];
  world.ground = [];
  return world;
}

function lengthOf(from: Vec2, path: readonly Vec2[]): number {
  let total: number = 0;
  let at: Vec2 = from;
  for (const point of path) {
    total += gap(at, point);
    at = point;
  }
  return total;
}

function routeTo(grid: NavGrid, from: Vec2, to: Vec2): Vec2[] {
  const found: Vec2[] = findPath(grid, from, to);
  return found.length === 0 ? [{ x: to.x, z: to.z }] : found;
}

function gapToLine(point: Vec2, from: Vec2, to: Vec2): number {
  const dx: number = to.x - from.x;
  const dz: number = to.z - from.z;
  const span: number = dx * dx + dz * dz;
  const along: number = span <= 0 ? 0 : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.z - from.z) * dz) / span));
  return gap(point, { x: from.x + dx * along, z: from.z + dz * along });
}

function gapToRoute(point: Vec2, route: Route): number {
  let best: number = Infinity;
  let at: Vec2 = route.from;
  for (const next of route.path) {
    best = Math.min(best, gapToLine(point, at, next));
    at = next;
  }
  return best;
}

function foesOf(world: World): MonsterState[] {
  return world.monsters.filter((monster: MonsterState): boolean => hostileTo(world, world.player, monster));
}

function routeThrough(world: World, ground: Ground, rng: Rng, foes: readonly MonsterState[]): Route | null {
  const anchor: MonsterState | undefined = foes[rng.int(0, Math.max(0, foes.length - 1))];
  if (anchor === undefined) return null;
  const angle: number = rng.range(0, Math.PI * 2);
  const out: number = rng.range(ROAM.leg.min, ROAM.leg.max);
  const back: number = rng.range(ROAM.leg.min, ROAM.leg.max);
  const from: Vec2 | null = nearestReached(ground.grid, ground.reach, { x: anchor.pos.x + Math.cos(angle) * out, z: anchor.pos.z + Math.sin(angle) * out }, ROAM.spotReach);
  const goal: Vec2 | null = nearestReached(ground.grid, ground.reach, { x: anchor.pos.x - Math.cos(angle) * back, z: anchor.pos.z - Math.sin(angle) * back }, ROAM.spotReach);
  if (from === null || goal === null) return null;
  if (foes.some((monster: MonsterState): boolean => gap(monster.pos, from) < ROAM.clear)) return null;
  const path: Vec2[] = findPath(world.grid, from, goal);
  const length: number = lengthOf(from, path);
  if (path.length === 0 || length < ROAM.leg.min || length > (out + back) * ROAM.detour) return null;
  return { from, goal, path, length };
}

function pickRoute(world: World, ground: Ground, rng: Rng): Route | null {
  const foes: MonsterState[] = foesOf(world);
  for (let attempt: number = 0; attempt < ROAM.routeTries; attempt += 1) {
    const route: Route | null = routeThrough(world, ground, rng, foes);
    if (route !== null) return route;
  }
  return null;
}

function readyLead(world: World, rng: Rng, seed: number, level: number, build: Build | null): void {
  if (build === null) stepWorld(world, [{ type: 'bench', hero: benchHero(world.content, rng, level) }], RL.tick);
  else readyBuild(world, build, DUEL_KIT, ARENA.benchSeed + seed, level);
}

function seatOf(role: RoamRole, hero: PlayerState, pickup: PickupRule): RoamSeat {
  return { role, hero, recall: createRecall(), tally: emptyTally(), pickup, path: [], pathAge: 0, left: 0, outcome: 'running', total: 0 };
}

function partnerOf(world: World, rng: Rng, seed: number, level: number, build: Build | null, beside: Vec2): PlayerState {
  const benched: PlayerState = benchedRival(world.content, rng, seed + ROAM.partnerSeed, level, build);
  const angle: number = rng.range(0, Math.PI * 2);
  const spot: Vec2 = { x: beside.x + Math.cos(angle) * ROAM.partnerGap, z: beside.z + Math.sin(angle) * ROAM.partnerGap };
  const partner: PlayerState = { ...benched, id: world.nextId, party: world.player.party, pos: nearestWalkable(world.grid, spot, ROAM.partnerReach) ?? { x: beside.x, z: beside.z } };
  world.nextId += 1;
  world.heroes.push(partner);
  return partner;
}

function roamIn(played: Content, zone: ZoneDef, options: RoamOptions, rng: Rng, level: number, zoneLevel: number): Roam | null {
  const world: World = roamWorld(played, zone, options.seed, zoneLevel);
  const ground: Ground = groundOf(played, zone);
  readyLead(world, rng, options.seed, level, options.builds?.[0] ?? null);
  spawnPacks(world);
  const route: Route | null = pickRoute(world, ground, rng);
  if (route === null) return null;
  world.monsters = world.monsters.filter((monster: MonsterState): boolean => gapToRoute(monster.pos, route) <= ROAM.keep);
  world.events = [];
  world.player.pos = { x: route.from.x, z: route.from.z };
  const lead: RoamSeat = seatOf('lead', world.player, rollRule(played, rng));
  const seats: RoamSeat[] = options.partner ? [lead, seatOf('partner', partnerOf(world, rng, options.seed, level, options.builds?.[1] ?? null, route.from), { minRarity: played.rarities.length })] : [lead];
  const roam: Roam = { options, world, seats, level, zone: zone.id, from: route.from, goal: route.goal, length: route.length, timeLimit: ROAM.baseTime + route.length * ROAM.timePerMetre, start: world.time, decisions: 0 };
  for (const seat of seats) repath(roam, seat);
  return roam;
}

export function createRoam(content: Content, options: RoamOptions): Roam {
  const rng: Rng = createRng(options.seed);
  const played: Content = jitterContent(content, rng, options.jitter);
  const rolled: number = rng.int(ARENA.levels.min, ARENA.levels.max);
  const level: number = options.level ?? (options.builds === undefined ? rolled : BUILD.level);
  const spread: number = rng.int(-ARENA.levelSpread, ARENA.levelSpread);
  const zoneLevel: number = options.builds === undefined ? Math.max(1, level + spread) : level;
  const zones: ZoneDef[] = roamZones(played).filter((zone: ZoneDef): boolean => options.zone === undefined || zone.id === options.zone);
  const first: number = zones.length === 0 ? 0 : rng.int(0, zones.length - 1);
  for (let turn: number = 0; turn < zones.length; turn += 1) {
    const zone: ZoneDef | undefined = zones[(first + turn) % zones.length];
    const roam: Roam | null = zone === undefined ? null : roamIn(played, zone, options, rng, level, zoneLevel);
    if (roam !== null) return roam;
  }
  throw new Error(`no ${options.zone ?? 'zone'} stretch to roam for seed ${options.seed}`);
}

export function roamRunning(roam: Roam): boolean {
  return roam.seats.every((seat: RoamSeat): boolean => seat.outcome === 'running');
}

function leadOf(roam: Roam): RoamSeat | null {
  return roam.seats[0] ?? null;
}

function aimOf(roam: Roam, seat: RoamSeat): Vec2 {
  return seat.role === 'lead' ? roam.goal : (leadOf(roam)?.hero.pos ?? roam.goal);
}

function trim(seat: RoamSeat): void {
  while (seat.path.length > 1) {
    const next: Vec2 | undefined = seat.path[0];
    if (next === undefined || gap(seat.hero.pos, next) > ROAM.reached) return;
    seat.path.shift();
  }
}

function repath(roam: Roam, seat: RoamSeat): void {
  seat.path = routeTo(roam.world.grid, seat.hero.pos, aimOf(roam, seat));
  seat.pathAge = 0;
  trim(seat);
  seat.left = lengthOf(seat.hero.pos, seat.path);
}

function follow(roam: Roam, seat: RoamSeat): void {
  seat.pathAge += 1;
  if (seat.pathAge >= ROAM.repath || seat.path.length === 0) repath(roam, seat);
  else trim(seat);
}

export function roamObjective(roam: Roam, seat: RoamSeat): Vec2 {
  const aim: Vec2 = aimOf(roam, seat);
  if (seat.role === 'partner' && lineWalkable(roam.world.grid, seat.hero.pos, aim)) return { x: aim.x, z: aim.z };
  return seat.path[0] ?? { x: aim.x, z: aim.z };
}

export function roamProgress(roam: Roam, seat: RoamSeat): number {
  return seat.role === 'lead' ? Math.max(0, Math.min(1, 1 - seat.left / Math.max(1, roam.length))) : 0;
}

export function roamContext(roam: Roam, seat: RoamSeat): ObserveContext {
  return { situation: 'roam', objective: roamObjective(roam, seat), timeLeft: Math.max(0, roam.timeLimit - (roam.world.time - roam.start)), progress: roamProgress(roam, seat), recall: seat.recall, pickup: seat.pickup };
}

export function roamObservation(roam: Roam, seat: RoamSeat): Observation {
  follow(roam, seat);
  const seen: Observation = observe(roam.world, roamContext(roam, seat), seat.hero);
  noteSeen(seat.recall, roam.world, seenMonsters(seen.view));
  return seen;
}

function ownEvents(events: readonly WorldEvent[], seat: RoamSeat): WorldEvent[] {
  return events.filter((event: WorldEvent): boolean => {
    if (event.type === 'damage' && event.targetTeam === 'monster') return event.sourceId === seat.hero.id;
    if (event.type === 'pickup') return seat.role === 'lead';
    return true;
  });
}

function calm(world: World, hero: PlayerState): boolean {
  return !world.monsters.some((monster: MonsterState): boolean => hostileTo(world, hero, monster) && gap(monster.pos, hero.pos) <= RL.nearReach);
}

function hurtBeside(events: readonly WorldEvent[], roam: Roam, seat: RoamSeat): number {
  let share: number = 0;
  for (const event of events) {
    if (event.type !== 'damage') continue;
    const other: RoamSeat | undefined = roam.seats.find((candidate: RoamSeat): boolean => candidate !== seat && candidate.hero.id === event.targetId);
    if (other !== undefined) share += Math.min(1, event.amount / Math.max(1, other.hero.maxLife));
  }
  return share;
}

function pay(seat: RoamSeat, rewards: number[], index: number, amount: number): void {
  rewards[index] = (rewards[index] ?? 0) + amount;
  seat.total += amount;
}

function fallen(seat: RoamSeat): boolean {
  return !seat.hero.alive || seat.tally.deaths > 0;
}

function settle(roam: Roam, rewards: number[]): void {
  const lead: RoamSeat | null = leadOf(roam);
  if (lead === null) return;
  if (roam.seats.some(fallen)) {
    roam.seats.forEach((seat: RoamSeat, index: number): void => {
      seat.outcome = fallen(seat) ? 'died' : 'timeout';
      if (!fallen(seat)) pay(seat, rewards, index, -REWARD.death * ROAM.guard);
    });
    return;
  }
  if (gap(lead.hero.pos, roam.goal) <= ROAM.arrive) {
    roam.seats.forEach((seat: RoamSeat, index: number): void => {
      const there: boolean = seat === lead || gap(seat.hero.pos, lead.hero.pos) <= ROAM.far;
      seat.outcome = there ? 'won' : 'timeout';
      if (there) pay(seat, rewards, index, seat === lead ? REWARD.win : ROAM.together);
    });
    return;
  }
  if (roam.world.time - roam.start < roam.timeLimit) return;
  for (const seat of roam.seats) seat.outcome = 'timeout';
}

export function afterRoamTick(roam: Roam, events: readonly WorldEvent[], rewards: number[]): void {
  const world: World = roam.world;
  roam.seats.forEach((seat: RoamSeat, index: number): void => {
    recallEvents(seat.recall, world, seat.hero, events);
    const lifeOf = (id: number): number => world.monsters.find((monster: MonsterState): boolean => monster.id === id)?.maxLife ?? findHero(world, id)?.maxLife ?? seat.hero.maxLife;
    const gained: number = rewardFor(ownEvents(events, seat), { playerId: seat.hero.id, playerMaxLife: seat.hero.maxLife, lifeOf, calm: calm(world, seat.hero), worth: (ground: GroundItem): number => worth(world.content, seat.pickup, ground) }, seat.tally);
    pay(seat, rewards, index, gained - hurtBeside(events, roam, seat) * REWARD.taken * ROAM.guard);
  });
  settle(roam, rewards);
}

function afterDecision(roam: Roam, rewards: number[]): void {
  const lead: RoamSeat | null = leadOf(roam);
  roam.seats.forEach((seat: RoamSeat, index: number): void => {
    trim(seat);
    const left: number = lengthOf(seat.hero.pos, seat.path);
    if (seat.role === 'lead') pay(seat, rewards, index, Math.max(-ROAM.progressCap, Math.min(ROAM.progressCap, seat.left - left)) * ROAM.progress);
    else if (lead !== null) {
      const apart: number = gap(seat.hero.pos, lead.hero.pos);
      if (apart <= ROAM.leash) pay(seat, rewards, index, ROAM.beside);
      else if (apart >= ROAM.far) pay(seat, rewards, index, -ROAM.apart);
    }
    seat.left = left;
  });
}

export function stepRoam(roam: Roam, commands: readonly (readonly Command[])[]): RoamStep {
  if (commands.length !== roam.seats.length) throw new Error(`this roam takes commands for ${roam.seats.length} seats, got ${commands.length}`);
  const rewards: number[] = roam.seats.map((): number => -REWARD.step);
  for (const seat of roam.seats) seat.total -= REWARD.step;
  const events: WorldEvent[] = [];
  const sent: Command[] = commands.flat();
  for (let tick: number = 0; tick < RL.ticksPerDecision && roamRunning(roam); tick += 1) {
    const happened: WorldEvent[] = stepWorld(roam.world, tick === 0 ? sent : [], RL.tick);
    events.push(...happened);
    afterRoamTick(roam, happened, rewards);
  }
  if (roamRunning(roam)) afterDecision(roam, rewards);
  roam.decisions += 1;
  return { rewards, done: !roamRunning(roam), events };
}
