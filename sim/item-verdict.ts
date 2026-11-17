import type { Content, ItemSlot, ResistedType, SkillDef, StatBlock, StatId } from './content/types.ts';
import { baseOf, slotOf } from './items.ts';
import { wornPowers, wornVariants } from './powers.ts';
import { computeStats, damagePerSecond, damageTakenScale, effectiveAttackSpeed, resistanceOf, resolveSkillBar, skillCycle } from './stats.ts';
import type { Threat, ThreatShare } from './threat.ts';
import { shareOf } from './threat.ts';
import { heldGroup } from './weapons.ts';
import type { Equipment, ItemInstance, PlayerState } from './world/types.ts';

export const VERDICT = {
  even: 0.02,
  clear: 0.02,
  tradeBand: 0.25,
  fightSeconds: 10,
  sharpSpeed: 0.1,
  scarce: 0.05,
  absent: 0.001,
  leastTaken: 0.005,
} as const;

export const RESISTED_STATS: Readonly<Record<ResistedType, StatId>> = {
  storm: 'stormResist',
  frost: 'frostResist',
};

export const OUTSIDE_VERDICT: readonly StatId[] = ['moveSpeed', 'goldFind'];

const RESISTED: readonly ResistedType[] = ['storm', 'frost'];

export type VerdictKind = 'better' | 'worse' | 'trade' | 'same';

export interface Verdict {
  readonly kind: VerdictKind;
  readonly power: number;
  readonly damage: number;
  readonly toughness: number;
  readonly speed: number;
  readonly against: readonly ResistedType[];
  readonly scarce: readonly ResistedType[];
  readonly absent: readonly ResistedType[];
  readonly capped: readonly ResistedType[];
}

export type VerdictSubject = Pick<PlayerState, 'level' | 'equipped' | 'allocated' | 'bar' | 'changes'>;

export interface Build {
  readonly stats: StatBlock;
  readonly skills: readonly (SkillDef | null)[];
}

export interface Standing {
  readonly damage: number;
  readonly toughness: number;
  readonly lead: SkillDef | null;
}

export function buildOf(content: Content, subject: VerdictSubject, equipped: Equipment): Build {
  const held: string | null = heldGroup(content, equipped);
  return {
    stats: computeStats(content, subject.level, equipped, subject.allocated, [], held),
    skills: resolveSkillBar(content, subject.bar, subject.allocated, wornPowers(content, equipped), wornVariants(content, equipped), held, subject.changes),
  };
}

function deals(skill: SkillDef): boolean {
  return skill.delivery.type !== 'dash' && (skill.damage.weaponPercent > 0 || skill.damage.flatMax > 0);
}

function manaGain(stats: StatBlock, skill: SkillDef): number {
  return stats.manaRegen + (skill.momentum === null ? 0 : skill.momentum.manaPerHit / skillCycle(stats, skill));
}

export function fightDamage(stats: StatBlock, skill: SkillDef, fallback: number): number {
  const full: number = damagePerSecond(stats, skill);
  if (skill.manaCost <= 0) return full;
  const spend: number = skill.manaCost / skillCycle(stats, skill);
  const gain: number = manaGain(stats, skill);
  if (gain >= spend) return full;
  const dry: number = Math.min(VERDICT.fightSeconds, Math.max(0, stats.maxMana) / (spend - gain));
  const after: number = Math.max(full * (Math.max(0, gain) / spend), fallback);
  return (full * dry + after * (VERDICT.fightSeconds - dry)) / VERDICT.fightSeconds;
}

function lead(build: Build): { readonly skill: SkillDef | null; readonly damage: number } {
  const dealing: SkillDef[] = build.skills.filter((skill: SkillDef | null): skill is SkillDef => skill !== null && deals(skill));
  const free: number = dealing.filter((skill: SkillDef): boolean => skill.manaCost <= 0).reduce((best: number, skill: SkillDef): number => Math.max(best, damagePerSecond(build.stats, skill)), 0);
  return dealing.reduce(
    (best: { readonly skill: SkillDef | null; readonly damage: number }, skill: SkillDef) => {
      const damage: number = fightDamage(build.stats, skill, free);
      return damage > best.damage ? { skill, damage } : best;
    },
    { skill: null, damage: 0 },
  );
}

export function takenScale(content: Content, stats: StatBlock, threat: Threat): number {
  const taken: number = threat.shares.reduce((sum: number, entry: ThreatShare): number => sum + entry.share * damageTakenScale(stats, entry.type, content.player.resistance, entry.stormTier), 0);
  return Math.max(VERDICT.leastTaken, taken);
}

function lifeGain(stats: StatBlock, skill: SkillDef | null): number {
  if (skill === null) return 0;
  const perHit: number = skill.lifeOnHit + (skill.momentum === null ? 0 : skill.momentum.lifePerHit);
  return perHit / skillCycle(stats, skill);
}

export function effectiveLife(content: Content, stats: StatBlock, skill: SkillDef | null, threat: Threat): number {
  const pool: number = stats.maxLife + (stats.lifeRegen + lifeGain(stats, skill)) * VERDICT.fightSeconds;
  return Math.max(0, pool) / takenScale(content, stats, threat);
}

export function standingOf(content: Content, build: Build, threat: Threat): Standing {
  const best = lead(build);
  return { damage: best.damage, toughness: effectiveLife(content, build.stats, best.skill, threat), lead: best.skill };
}

function change(after: number, before: number): number {
  if (before <= 0) return after > 0 ? 1 : 0;
  return after / before - 1;
}

function kindOf(power: number, damage: number, toughness: number): VerdictKind {
  const traded: boolean = (damage > VERDICT.clear && toughness < -VERDICT.clear) || (damage < -VERDICT.clear && toughness > VERDICT.clear);
  const band: number = traded ? Math.max(VERDICT.even, VERDICT.tradeBand * Math.min(Math.abs(damage), Math.abs(toughness))) : VERDICT.even;
  if (traded && Math.abs(power) <= band) return 'trade';
  if (power > VERDICT.even) return 'better';
  if (power < -VERDICT.even) return 'worse';
  return 'same';
}

function withResistance(stats: StatBlock, from: StatBlock): StatBlock {
  const kept: StatBlock = { ...stats };
  for (const type of RESISTED) kept[RESISTED_STATS[type]] = from[RESISTED_STATS[type]];
  return kept;
}

export function compareBuilds(content: Content, before: Build, after: Build, threat: Threat): Verdict {
  const was: Standing = standingOf(content, before, threat);
  const now: Standing = standingOf(content, after, threat);
  const damage: number = change(now.damage, was.damage);
  const toughness: number = change(now.toughness, was.toughness);
  const power: number = change(now.damage * now.toughness, was.damage * was.toughness);
  const raised: ResistedType[] = RESISTED.filter((type: ResistedType): boolean => after.stats[RESISTED_STATS[type]] > before.stats[RESISTED_STATS[type]] + VERDICT.absent);
  const moved: ResistedType[] = RESISTED.filter((type: ResistedType): boolean => Math.abs(after.stats[RESISTED_STATS[type]] - before.stats[RESISTED_STATS[type]]) > VERDICT.absent);
  const rules = content.player.resistance;
  const capped: ResistedType[] = raised.filter(
    (type: ResistedType): boolean =>
      shareOf(threat, type) >= VERDICT.absent &&
      threat.shares.every((entry: ThreatShare): boolean => entry.type !== type || resistanceOf(after.stats, type, rules, entry.stormTier) <= resistanceOf(before.stats, type, rules, entry.stormTier) + VERDICT.absent),
  );
  const open: ResistedType[] = raised.filter((type: ResistedType): boolean => !capped.includes(type));
  const absent: ResistedType[] = open.filter((type: ResistedType): boolean => shareOf(threat, type) < VERDICT.absent);
  const scarce: ResistedType[] = open.filter((type: ResistedType): boolean => !absent.includes(type) && shareOf(threat, type) < VERDICT.scarce);
  const bare: number = effectiveLife(content, withResistance(after.stats, before.stats), now.lead, threat);
  const fromResistance: number = change(now.toughness, bare);
  const resistanceLed: boolean = Math.abs(fromResistance) >= VERDICT.clear && Math.sign(fromResistance) === Math.sign(toughness) && Math.abs(fromResistance) * 2 >= Math.abs(toughness);
  const against: ResistedType[] = resistanceLed ? moved.filter((type: ResistedType): boolean => shareOf(threat, type) >= VERDICT.absent) : [];
  return {
    kind: kindOf(power, damage, toughness),
    power,
    damage,
    toughness,
    speed: change(effectiveAttackSpeed(after.stats), effectiveAttackSpeed(before.stats)),
    against,
    scarce,
    absent,
    capped,
  };
}

export function itemVerdict(content: Content, subject: VerdictSubject, threat: Threat, item: ItemInstance): Verdict | null {
  const slot: ItemSlot | null = slotOf(content, item);
  if (slot === null || baseOf(content, item) === null) return null;
  const swapped: Equipment = { ...subject.equipped, [slot]: item };
  return compareBuilds(content, buildOf(content, subject, subject.equipped), buildOf(content, subject, swapped), threat);
}

function percent(value: number): number {
  return Math.round(value * 100);
}

function signedPercent(value: number): string {
  const rounded: number = percent(value);
  return `${rounded < 0 ? '−' : '+'}${Math.abs(rounded)}%`;
}

function listed(types: readonly ResistedType[]): string {
  if (types.length <= 1) return types.join('');
  return `${types.slice(0, -1).join(', ')} and ${types[types.length - 1] ?? ''}`;
}

interface Part {
  readonly value: number;
  readonly text: string;
}

export function verdictParts(verdict: Verdict): readonly string[] {
  const parts: Part[] = [];
  if (percent(verdict.damage) !== 0) parts.push({ value: verdict.damage, text: `${signedPercent(verdict.damage)} damage` });
  if (percent(verdict.toughness) !== 0) {
    const against: string = verdict.against.length === 0 ? '' : ` against ${listed(verdict.against)}`;
    parts.push({ value: verdict.toughness, text: `${signedPercent(verdict.toughness)} toughness${against}` });
  }
  if (Math.abs(verdict.speed) >= VERDICT.sharpSpeed && percent(verdict.speed) !== 0) parts.push({ value: verdict.speed, text: `${signedPercent(verdict.speed)} attack speed` });
  return parts.toSorted((a: Part, b: Part): number => b.value - a.value).map((part: Part): string => part.text);
}

export function verdictNote(verdict: Verdict): string | null {
  const nearby: string[] = [];
  if (verdict.scarce.length > 0) nearby.push(`little ${listed(verdict.scarce)}`);
  if (verdict.absent.length > 0) nearby.push(`no ${listed(verdict.absent)}`);
  const notes: string[] = [];
  if (nearby.length > 0) notes.push(`${nearby.join(' and ')} damage nearby`);
  if (verdict.capped.length > 0) notes.push(`${listed(verdict.capped)} resistance already capped`);
  if (notes.length === 0) return null;
  const text: string = notes.join(' · ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
