import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef, ZonePack } from '../content/types.ts';
import { fightZones } from '../world/moments.ts';
import type { PlayerState } from '../world/types.ts';
import { must } from '../../test/support.ts';
import { LAYOUT, RL } from './contract.ts';
import type { EpisodeSummary, Match, MatchKind, Pool, PoolOptions, PoolStep } from './pool.ts';
import { arenaSeats, createPool, matchCount, matchHeroes, matchKind, stepPool } from './pool.ts';
import { ROAM } from './roam.ts';

const CONTENT: Content = loadContent();
const YARD = { id: 'roam_yard', copies: 3 } as const;
const MIXED: PoolOptions = { seed: 11, envs: 7, duels: 1, roams: 1, escorts: 1, jitter: 0, waves: 1, keepEvery: 0, levels: [] };

function yardContent(): Content {
  const hall: ZoneDef = must(CONTENT.zones.get(must(fightZones(CONTENT)[0], 'a fight zone')), 'the fight zone');
  const packs: ZonePack[] = Array.from({ length: YARD.copies }, (): readonly ZonePack[] => hall.packs).flat();
  const small: [string, ZoneDef][] = [...CONTENT.zones].filter(([, zone]: [string, ZoneDef]): boolean => zone.packs.length < ROAM.minPacks);
  return { ...CONTENT, zones: new Map<string, ZoneDef>([...small, [YARD.id, { ...hall, id: YARD.id, packs }]]) };
}

const YARD_CONTENT: Content = yardContent();

function still(pool: Pool): PoolStep {
  return stepPool(pool, new Int32Array(pool.options.envs * RL.actionParts));
}

void test('arenas come first, then duels, then roams, then escorts', (): void => {
  assert.equal(arenaSeats(MIXED), 2);
  assert.equal(matchCount(MIXED), 5);
  assert.deepEqual([0, 1, 2, 3, 4].map((index: number): MatchKind => matchKind(MIXED, index)), ['arena', 'arena', 'duel', 'roam', 'escort']);
});

void test('a pool with no roams keeps the layout it always had', (): void => {
  const plain: PoolOptions = { seed: 12, envs: 4, duels: 1, jitter: 0, waves: 1, keepEvery: 0, levels: [] };
  assert.equal(arenaSeats(plain), 2);
  assert.deepEqual([0, 1, 2].map((index: number): MatchKind => matchKind(plain, index)), ['arena', 'arena', 'duel']);
});

void test('a roam takes one env and an escort two, on one side', (): void => {
  const pool: Pool = createPool(YARD_CONTENT, MIXED);
  assert.deepEqual(pool.matches.map((match: Match): string => match.kind), ['arena', 'arena', 'duel', 'roam', 'roam']);
  assert.deepEqual(pool.matches.map((match: Match): number => matchHeroes(match).length), [1, 1, 2, 1, 2]);
  assert.equal(pool.seen.length, MIXED.envs);
  const escort: PlayerState[] = matchHeroes(must(pool.matches[4], 'the escort'));
  assert.equal(must(escort[0], 'the lead').party, must(escort[1], 'the partner').party);
  const step: PoolStep = still(pool);
  assert.equal(step.obs.length, MIXED.envs * LAYOUT.size);
  assert.equal(step.rewards.length, MIXED.envs);
});

void test('a finished roam is reported by seat with its role, and a new one takes its place', (): void => {
  const pool: Pool = createPool(YARD_CONTENT, MIXED);
  const escort: Match = must(pool.matches[4], 'the escort');
  must(matchHeroes(escort)[0], 'the lead').alive = false;
  const step: PoolStep = still(pool);
  const roams: EpisodeSummary[] = step.finished.filter((episode: EpisodeSummary): boolean => episode.situation === 'roam');
  assert.deepEqual(roams.map((episode: EpisodeSummary): [number, string | undefined, string] => [episode.env, episode.role, episode.outcome]), [[5, 'lead', 'died'], [6, 'partner', 'timeout']]);
  assert.deepEqual([...step.dones], [0, 0, 0, 0, 0, 1, 1]);
  assert.notEqual(pool.matches[4], escort);
  assert.equal(must(pool.matches[4], 'the next escort').kind, 'roam');
});

void test('a pool refuses more roams and escorts than its envs hold', (): void => {
  assert.throws((): Pool => createPool(YARD_CONTENT, { ...MIXED, envs: 4 }), /need 5 envs/);
  assert.throws((): Pool => createPool(YARD_CONTENT, { ...MIXED, roams: -1 }), /roams/);
});
