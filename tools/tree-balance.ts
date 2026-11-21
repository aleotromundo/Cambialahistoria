import type { Content, SpecialtyDef } from '../sim/content/types.ts';
import type { DuelKit } from '../sim/rl/kit.ts';
import { specialtyOf } from '../sim/specialty.ts';
import type { ScoredBuild } from '../sim/tree-best.ts';
import { bestFor, completeBuild, pathWeapon, treeLift } from '../sim/tree-best.ts';
import type { BuildPolicy, Policies } from './simulate-policies.ts';
import { spread } from './simulate-summary.ts';

export const BALANCE = {
  level: 30,
  share: 2.25,
  specialtyPrefix: 'spec_',
} as const;

export interface LiftedBuild {
  readonly name: string;
  readonly build: ScoredBuild;
  readonly lift: number;
}

export function specialtyBuilds(content: Content, kit: DuelKit, policies: Policies, level: number): LiftedBuild[] {
  return [...policies.builds.values()].flatMap((policy: BuildPolicy): LiftedBuild[] => {
    if (!policy.name.startsWith(BALANCE.specialtyPrefix)) return [];
    const specialty: SpecialtyDef | null = specialtyOf(content, policy.name.slice(BALANCE.specialtyPrefix.length));
    const weapon: string | null = specialty === null ? null : pathWeapon(content, kit, specialty.path);
    if (weapon === null) throw new Error(`${policy.name} names no specialty with a standard weapon`);
    const build: ScoredBuild = completeBuild(content, kit, weapon, policy.route, level);
    return [{ name: policy.name, build, lift: treeLift(content, kit, build, level) }];
  });
}

export function bestBuilds(content: Content, kit: DuelKit, level: number, specialties: readonly LiftedBuild[]): LiftedBuild[] {
  return kit.weapons.map((weapon: string): LiftedBuild => {
    const searched: ScoredBuild = bestFor(content, kit, weapon, level);
    const rivals: readonly ScoredBuild[] = specialties.map((entry: LiftedBuild): ScoredBuild => entry.build).filter((build: ScoredBuild): boolean => build.weapon === weapon);
    const build: ScoredBuild = [searched, ...rivals].reduce((best: ScoredBuild, entry: ScoredBuild): ScoredBuild => (entry.score > best.score ? entry : best));
    return { name: `best ${weapon}`, build, lift: treeLift(content, kit, build, level) };
  });
}

export function medianLift(builds: readonly LiftedBuild[]): number {
  return spread(builds.map((entry: LiftedBuild): number => entry.lift)).median;
}

export function aheadOfBand(best: readonly LiftedBuild[], median: number, share: number): LiftedBuild[] {
  return best.filter((entry: LiftedBuild): boolean => entry.lift > median * share);
}

export function liftTable(builds: readonly LiftedBuild[]): string {
  const head: string = '| build | weapon | lead | damage | toughness | lift |';
  const line: string = '|---|---|---|---|---|---|';
  const body: string[] = builds.map((entry: LiftedBuild): string => `| ${entry.name} | ${entry.build.weapon} | ${entry.build.lead ?? '-'} | ${Math.round(entry.build.damage)} | ${Math.round(entry.build.toughness)} | ${Math.round(entry.lift * 100) / 100} |`);
  return [head, line, ...body].join('\n');
}
