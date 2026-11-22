import type { Bot } from '../sim/bot.ts';
import { BOT, botStep, createBot } from '../sim/bot.ts';
import type { ItemBaseDef } from '../sim/content/item-types.ts';
import type { Content, SkillTreeNodeDef, WeaponGroup } from '../sim/content/types.ts';
import type { Measurement } from '../sim/measure.ts';
import { findNode } from '../sim/progression.ts';
import { createWorld } from '../sim/world/create.ts';
import type { World } from '../sim/world/types.ts';
import type { PackFight } from './simulate-pack.ts';
import type { BuildPolicy, Policies, SkillPolicy } from './simulate-policies.ts';
import { planFor } from './simulate-policies.ts';
import { fightPack, fixedLevel, RUN } from './simulate-run.ts';
import { spread } from './simulate-summary.ts';
import type { TrialAttempt } from './simulate-trial.ts';
import { bestWeapon, gearUp, raiseTo, runTrial } from './simulate-trial.ts';

export const ENDGAME = {
  levels: [15, 30],
  seeds: [1, 2, 3],
  skill: 'average',
  pack: 'cinder_hound:6+ember_spitter:3+slagback:2',
  packCount: 1,
  bossZone: 'ledger_court',
  bossLimit: 300,
  settle: 3,
  timeFactor: 2.6,
  deathAllowance: 0.34,
  archetypes: ['glass', 'tank', 'caster', 'windrunner', 'echoer', 'spellblade', 'duelist', 'spinner'],
  specialtyPrefix: 'spec_',
} as const;

export type Fight = 'pack' | 'boss';

export const FIGHTS: readonly Fight[] = ['pack', 'boss'];

export type FightOutcome = 'won' | 'lost' | 'timeout';

export interface FightResult {
  readonly outcome: FightOutcome;
  readonly seconds: number;
  readonly limit: number;
}

export interface BandJob {
  readonly build: string;
  readonly fight: Fight;
  readonly level: number;
  readonly seed: number;
}

export function bandBuilds(policies: Policies): string[] {
  const specialties: string[] = [...policies.builds.keys()].filter((name: string): boolean => name.startsWith(ENDGAME.specialtyPrefix));
  return [...specialties, ...ENDGAME.archetypes.filter((name: string): boolean => policies.builds.has(name))];
}

function routePaths(content: Content, route: readonly string[]): string[] {
  return route.flatMap((id: string): string[] => {
    const node: SkillTreeNodeDef | null = findNode(content, id);
    return node === null ? [] : [node.path];
  });
}

export function buildGroup(content: Content, build: BuildPolicy): WeaponGroup | null {
  for (const id of build.route) {
    const weapon: string | null = findNode(content, id)?.weapon ?? null;
    const group: WeaponGroup | undefined = content.chart.weaponGroups.find((entry: WeaponGroup): boolean => entry.id === weapon);
    if (group !== undefined) return group;
  }
  const paths: readonly string[] = routePaths(content, build.route);
  const ranked: WeaponGroup[] = content.chart.weaponGroups.toSorted((a: WeaponGroup, b: WeaponGroup): number => paths.filter((path: string): boolean => path === b.path).length - paths.filter((path: string): boolean => path === a.path).length);
  return ranked[0] ?? null;
}

export function buildWeapon(content: Content, build: BuildPolicy, level: number): ItemBaseDef | null {
  const group: WeaponGroup | null = buildGroup(content, build);
  const kind: string | undefined = group?.kinds[0];
  return kind === undefined ? null : bestWeapon(content, kind, level);
}

function packFight(level: number): PackFight {
  return { kind: 'pack', monster: ENDGAME.pack, count: ENDGAME.packCount, levels: [level], repeats: 1, minutes: 0, groups: 1, gap: 0 };
}

function readyBot(content: Content, skill: SkillPolicy, build: BuildPolicy, weapon: string, level: number, seed: number): Bot {
  const world: World = createWorld(content, build.hero === null ? { seed, save: null, opening: false } : { seed, save: null, opening: false, hero: build.hero });
  const bot: Bot = createBot(world, skill.habits, (): void => {}, planFor(skill, build));
  raiseTo(world, level);
  gearUp(bot, weapon, level);
  for (let waited: number = 0; waited < ENDGAME.settle; waited += BOT.step) botStep(bot, []);
  world.player.life = world.player.maxLife;
  world.player.mana = world.player.stats.maxMana;
  return bot;
}

export function runBandJob(content: Content, policies: Policies, job: BandJob): FightResult {
  const skill: SkillPolicy | undefined = policies.skills.get(ENDGAME.skill);
  const build: BuildPolicy | undefined = policies.builds.get(job.build);
  if (skill === undefined || build === undefined) throw new Error(`no policy ${ENDGAME.skill}/${job.build}`);
  const weapon: ItemBaseDef | null = buildWeapon(content, build, job.level);
  if (weapon === null) throw new Error(`${job.build} has no weapon at level ${job.level}`);
  const fixed: Content = fixedLevel(content, job.level);
  switch (job.fight) {
    case 'pack': {
      const measured: Measurement | null = fightPack(readyBot(fixed, skill, build, weapon.id, job.level, job.seed), packFight(job.level), 0);
      if (measured === null || measured.kind !== 'boss') throw new Error(`${job.build} found no ground for the pack`);
      return { outcome: measured.outcome, seconds: measured.seconds, limit: RUN.packLimit };
    }
    case 'boss': {
      const tried: TrialAttempt = runTrial(fixed, policies, { zone: ENDGAME.bossZone, skill: ENDGAME.skill, build: job.build, weapon: weapon.id, hero: build.hero, seed: job.seed, limit: ENDGAME.bossLimit }, job.level);
      return { outcome: tried.outcome, seconds: tried.seconds, limit: ENDGAME.bossLimit };
    }
  }
  throw new Error(`unknown fight ${String(job.fight)}`);
}

export interface BandCell {
  readonly build: string;
  readonly fight: Fight;
  readonly level: number;
  readonly time: number;
  readonly deaths: number;
  readonly timeouts: number;
  readonly runs: number;
}

export function fightTime(result: FightResult): number {
  return result.outcome === 'won' ? result.seconds : result.limit;
}

function counted(results: readonly FightResult[], outcome: FightOutcome): number {
  return results.filter((result: FightResult): boolean => result.outcome === outcome).length;
}

export function bandCell(build: string, fight: Fight, level: number, results: readonly FightResult[]): BandCell {
  return { build, fight, level, time: spread(results.map(fightTime)).median, deaths: counted(results, 'lost'), timeouts: counted(results, 'timeout'), runs: results.length };
}

export interface BandMiss {
  readonly cell: BandCell;
  readonly median: number;
  readonly why: 'slow' | 'fast' | 'deaths';
}

function deathShare(cell: BandCell): number {
  return cell.deaths / Math.max(1, cell.runs);
}

export function bandMisses(cells: readonly BandCell[], timeFactor: number, deathAllowance: number): BandMiss[] {
  const misses: BandMiss[] = [];
  const groups: Map<string, BandCell[]> = new Map<string, BandCell[]>();
  for (const cell of cells) groups.set(`${cell.fight} ${cell.level}`, [...(groups.get(`${cell.fight} ${cell.level}`) ?? []), cell]);
  for (const group of groups.values()) {
    const median: number = spread(group.map((cell: BandCell): number => cell.time)).median;
    const deathMedian: number = spread(group.map(deathShare)).median;
    for (const cell of group) {
      if (cell.time > median * timeFactor) misses.push({ cell, median, why: 'slow' });
      else if (cell.time * timeFactor < median) misses.push({ cell, median, why: 'fast' });
      if (deathShare(cell) > deathMedian + deathAllowance) misses.push({ cell, median, why: 'deaths' });
    }
  }
  return misses;
}

export function bandTable(cells: readonly BandCell[]): string {
  const head: string = '| build | fight | level | median seconds | deaths | timeouts |';
  const line: string = '|---|---|---|---|---|---|';
  const body: string[] = cells.map((cell: BandCell): string => `| ${cell.build} | ${cell.fight} | ${cell.level} | ${Math.round(cell.time * 10) / 10} | ${cell.deaths}/${cell.runs} | ${cell.timeouts}/${cell.runs} |`);
  return [head, line, ...body].join('\n');
}
