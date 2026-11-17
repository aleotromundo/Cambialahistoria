import type { MonsterModDef } from './content/combat-types.ts';
import type { PackRankDef, RankScale } from './content/rank-types.ts';
import type { Content, DamageType, MonsterDef, SkillDef, ZoneDef, ZonePack } from './content/types.ts';
import { DAMAGE_TYPES } from './content/types.ts';
import { rankChance } from './world/ranks.ts';
import { withMods } from './world/elites.ts';

export const THREAT = {
  engagedSeconds: 6,
  minCycle: 0.25,
  summonDepth: 1,
} as const;

export type DamageMix = Readonly<Record<DamageType, number>>;

export interface ThreatShare {
  readonly type: DamageType;
  readonly stormTier: number;
  readonly share: number;
}

export interface Threat {
  readonly zones: readonly string[];
  readonly shares: readonly ThreatShare[];
}

type Dealt = Record<DamageType, number>;

interface RankOdds {
  readonly rank: PackRankDef | null;
  readonly odds: number;
}

function none(): Dealt {
  return { physical: 0, storm: 0, frost: 0 };
}

function addInto(into: Dealt, from: Dealt, times: number): void {
  for (const type of DAMAGE_TYPES) into[type] += from[type] * times;
}

function hitOf(def: MonsterDef, skill: SkillDef): number {
  return ((def.damageMin + def.damageMax) / 2) * skill.damage.weaponPercent + (skill.damage.flatMin + skill.damage.flatMax) / 2;
}

function cycleOf(skill: SkillDef): number {
  return Math.max(skill.windup + skill.recovery, skill.cooldown, THREAT.minCycle);
}

function dealtBy(content: Content, def: MonsterDef, depth: number): Dealt {
  const dealt: Dealt = none();
  const skill: SkillDef | undefined = content.skills.get(def.skill);
  if (skill !== undefined) dealt[skill.damage.type] += hitOf(def, skill) * (THREAT.engagedSeconds / cycleOf(skill));
  const last: SkillDef | undefined = def.deathSkill === null ? undefined : content.skills.get(def.deathSkill);
  if (last !== undefined) dealt[last.damage.type] += hitOf(def, last);
  const called: MonsterDef | undefined = def.summon?.monster === null || def.summon === null ? undefined : content.monsters.get(def.summon.monster);
  if (called !== undefined && def.summon !== null && depth < THREAT.summonDepth) addInto(dealt, dealtBy(content, called, depth + 1), def.summon.limit);
  return dealt;
}

function scaledDef(def: MonsterDef, scale: RankScale): MonsterDef {
  return { ...def, damageMin: def.damageMin * scale.damage, damageMax: def.damageMax * scale.damage };
}

function modOdds(content: Content, picks: number): readonly { readonly mod: MonsterModDef; readonly odds: number }[] {
  const total: number = content.packRanks.pool.reduce((sum: number, choice): number => sum + Math.max(0, choice.weight), 0);
  if (total <= 0 || picks <= 0) return [];
  return content.packRanks.pool.flatMap((choice) => {
    const mod: MonsterModDef | undefined = content.monsterMods.get(choice.mod);
    const one: number = Math.max(0, choice.weight) / total;
    return mod === undefined ? [] : [{ mod, odds: 1 - Math.pow(1 - one, picks) }];
  });
}

function rankedDealt(content: Content, def: MonsterDef, scale: RankScale): Dealt {
  const base: MonsterDef = scaledDef(def, scale);
  const plain: Dealt = dealtBy(content, base, 0);
  const dealt: Dealt = { ...plain };
  for (const { mod, odds } of modOdds(content, scale.mods)) {
    const modded: Dealt = dealtBy(content, withMods(base, [mod]), 0);
    for (const type of DAMAGE_TYPES) dealt[type] += odds * (modded[type] - plain[type]);
  }
  return dealt;
}

function rankOdds(content: Content, zone: ZoneDef, pack: ZonePack): readonly RankOdds[] {
  if (!zone.ranks) return [{ rank: null, odds: 1 }];
  const ranks: readonly PackRankDef[] = content.packRanks.ranks;
  if (pack.rank !== undefined) return [{ rank: ranks.find((rank: PackRankDef): boolean => rank.id === pack.rank) ?? null, odds: 1 }];
  const level: number = pack.level ?? zone.level;
  const odds: RankOdds[] = [];
  let left: number = 1;
  for (let index: number = ranks.length - 1; index > 0; index -= 1) {
    const rank: PackRankDef | undefined = ranks[index];
    if (rank === undefined || rank.chance === null) continue;
    const chance: number = left * rankChance(rank.chance, level);
    odds.push({ rank, odds: chance });
    left -= chance;
  }
  odds.push({ rank: ranks[0] ?? null, odds: left });
  return odds;
}

function packDealt(content: Content, zone: ZoneDef, pack: ZonePack): Dealt {
  const defs: MonsterDef[] = pack.members.flatMap((member) => {
    const base: MonsterDef | undefined = content.monsters.get(member.monster);
    if (base === undefined) return [];
    const mods: MonsterModDef[] = member.mods.flatMap((id: string): MonsterModDef[] => {
      const mod: MonsterModDef | undefined = content.monsterMods.get(id);
      return mod === undefined ? [] : [mod];
    });
    const def: MonsterDef = withMods(base, mods);
    return Array.from({ length: Math.max(0, member.count) }, (): MonsterDef => def);
  });
  const dealt: Dealt = none();
  const rankable: boolean = defs.length > 0 && defs.every((def: MonsterDef): boolean => def.boss === null && def.rank === null && def.mods.length === 0);
  for (const { rank, odds } of rankOdds(content, zone, pack)) {
    const leader: RankScale | null = rank === null || rank.chance === null || !rankable ? null : rank.leader;
    const lead: number = leader === null ? -1 : defs.reduce((best: number, def: MonsterDef, index: number): number => (def.life > (defs[best]?.life ?? 0) ? index : best), 0);
    defs.forEach((def: MonsterDef, index: number): void => {
      const scale: RankScale | null = rank === null || rank.chance === null || !rankable ? null : index === lead && leader !== null ? leader : rank.members;
      addInto(dealt, scale === null ? dealtBy(content, def, 0) : rankedDealt(content, def, scale), odds);
    });
  }
  return dealt;
}

export function zoneDamageMix(content: Content, zone: ZoneDef): DamageMix {
  const dealt: Dealt = none();
  for (const pack of zone.packs) addInto(dealt, packDealt(content, zone, pack), 1);
  const total: number = DAMAGE_TYPES.reduce((sum: number, type: DamageType): number => sum + dealt[type], 0);
  if (total <= 0) return { physical: 1, storm: 0, frost: 0 };
  return { physical: dealt.physical / total, storm: dealt.storm / total, frost: dealt.frost / total };
}

function fights(zone: ZoneDef): boolean {
  return zone.kind === 'wild' && zone.packs.length > 0;
}

export function depthZones(content: Content, visited: readonly string[], here: ZoneDef): readonly ZoneDef[] {
  const wild: ZoneDef[] = [...content.zones.values()].filter(fights).toSorted((a: ZoneDef, b: ZoneDef): number => a.level - b.level);
  const seen: ZoneDef[] = wild.filter((zone: ZoneDef): boolean => visited.includes(zone.id));
  const current: ZoneDef | undefined = fights(here) ? here : (seen[seen.length - 1] ?? wild[0]);
  if (current === undefined) return [];
  const next: ZoneDef | undefined = wild.find((zone: ZoneDef): boolean => zone.level > current.level);
  return next === undefined ? [current] : [current, next];
}

export function threatOf(content: Content, zones: readonly ZoneDef[]): Threat {
  if (zones.length === 0) return { zones: [], shares: [{ type: 'physical', stormTier: 0, share: 1 }] };
  const shares: ThreatShare[] = zones.flatMap((zone: ZoneDef): ThreatShare[] => {
    const mix: DamageMix = zoneDamageMix(content, zone);
    return DAMAGE_TYPES.map((type: DamageType): ThreatShare => ({ type, stormTier: zone.stormTier, share: mix[type] / zones.length }));
  });
  return { zones: zones.map((zone: ZoneDef): string => zone.id), shares };
}

export function threatNear(content: Content, visited: readonly string[], here: ZoneDef): Threat {
  return threatOf(content, depthZones(content, visited, here));
}

export function shareOf(threat: Threat, type: DamageType): number {
  return threat.shares.reduce((sum: number, entry: ThreatShare): number => (entry.type === type ? sum + entry.share : sum), 0);
}
