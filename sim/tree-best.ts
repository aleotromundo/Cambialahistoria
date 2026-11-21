import type { Content, ItemBaseDef, SkillDef, SkillTreeNodeDef, WeaponGroup } from './content/types.ts';
import { emptyEquipment } from './items.ts';
import type { Build, Standing, VerdictSubject } from './item-verdict.ts';
import { buildOf, standingOf } from './item-verdict.ts';
import { findNode } from './progression.ts';
import { basicSkill, bookSkills, buildPoints } from './rl/build.ts';
import type { DuelKit, KitPiece } from './rl/kit.ts';
import { weaponGroupOf } from './rl/kit.ts';
import type { Threat } from './threat.ts';
import { mixThreat } from './threat.ts';
import { bestStack } from './tree-stack.ts';
import type { Equipment } from './world/types.ts';

export const BEST = {
  threat: { physical: 0.5, storm: 0.25, frost: 0.25 },
  rounds: 3,
  unlockLift: 2,
} as const;

export interface ScoredBuild {
  readonly weapon: string;
  readonly route: readonly string[];
  readonly score: number;
  readonly damage: number;
  readonly toughness: number;
  readonly lead: string | null;
}

export const STANDARD_THREAT: Threat = mixThreat(BEST.threat);

export function kitEquipment(content: Content, kit: DuelKit, weapon: string, level: number): Equipment {
  const equipped: Equipment = emptyEquipment();
  const pieces: readonly KitPiece[] = [{ slot: 'weapon', base: weapon }, ...kit.armour];
  let uid: number = 1;
  for (const piece of pieces) {
    if (!content.itemBases.has(piece.base)) continue;
    equipped[piece.slot] = { uid, base: piece.base, rarity: kit.rarity, level, affixes: [], ledger: null };
    uid += 1;
  }
  return equipped;
}

function unlocks(content: Content, route: readonly string[]): string[] {
  return route.flatMap((id: string): string[] => {
    const unlock: string | null = findNode(content, id)?.unlock ?? null;
    return unlock === null ? [] : [unlock];
  });
}

export function legalBar(content: Content, route: readonly string[], level: number): string[] {
  const basic: string | null = basicSkill(content);
  const known: string[] = [...bookSkills(content, level), ...unlocks(content, route)];
  return [...new Set<string>([...(basic === null ? [] : [basic]), ...known])].filter((skill: string): boolean => content.skills.has(skill));
}

function standing(content: Content, equipped: Equipment, route: readonly string[], bar: readonly string[], level: number): Standing {
  const subject: VerdictSubject = { level, equipped, allocated: [...route], bar: [...bar], changes: {} };
  const build: Build = buildOf(content, subject, equipped);
  return standingOf(content, build, STANDARD_THREAT);
}

function power(found: Standing): number {
  return found.damage * found.toughness;
}

export function scoreBuild(content: Content, kit: DuelKit, weapon: string, route: readonly string[], level: number): ScoredBuild {
  const found: Standing = standing(content, kitEquipment(content, kit, weapon, level), route, legalBar(content, route, level), level);
  return { weapon, route, score: power(found), damage: found.damage, toughness: found.toughness, lead: found.lead?.id ?? null };
}

function counts(node: SkillTreeNodeDef): boolean {
  return node.statMods.length > 0 || node.skillMods.length > 0 || node.variants.length > 0 || node.unlock !== null;
}

interface Aim {
  readonly bar: (route: readonly string[]) => readonly string[];
  readonly lift: string | null;
}

function marginals(content: Content, equipped: Equipment, route: readonly string[], aim: Aim, level: number): Map<string, number> {
  const bar: readonly string[] = aim.bar(route);
  const here: number = power(standing(content, equipped, route, bar, level));
  const held: ReadonlySet<string> = new Set<string>(route);
  const weights: Map<string, number> = new Map<string, number>();
  for (const node of content.skillTree) {
    if (!counts(node)) continue;
    const other: readonly string[] = held.has(node.id) ? route.filter((id: string): boolean => id !== node.id) : [...route, node.id];
    const there: number = power(standing(content, equipped, other, bar, level));
    weights.set(node.id, held.has(node.id) ? here - there : there - here);
  }
  if (aim.lift !== null) {
    const top: number = [...weights.values()].reduce((sum: number, value: number): number => sum + Math.max(0, value), 0);
    for (const node of content.skillTree) if (node.unlock === aim.lift) weights.set(node.id, Math.max(here, top) * BEST.unlockLift);
  }
  return weights;
}

function search(content: Content, kit: DuelKit, weapon: string, level: number, aim: Aim, from: readonly string[]): ScoredBuild {
  const equipped: Equipment = kitEquipment(content, kit, weapon, level);
  const points: number = buildPoints(content, level);
  let best: ScoredBuild = scoreBuild(content, kit, weapon, from.slice(0, points), level);
  let current: readonly string[] = from.slice(0, points);
  for (let round: number = 0; round < BEST.rounds; round += 1) {
    const weights: ReadonlyMap<string, number> = marginals(content, equipped, current, aim, level);
    const found: readonly string[] = bestStack(content, (node: SkillTreeNodeDef): number => weights.get(node.id) ?? 0, points, from).route;
    const scored: ScoredBuild = scoreBuild(content, kit, weapon, found, level);
    if (scored.score > best.score) best = scored;
    current = found;
  }
  return best;
}

function needsUnlock(content: Content, skill: string, level: number): boolean {
  return !bookSkills(content, level).includes(skill) && skill !== basicSkill(content);
}

export function treeSkills(content: Content, level: number): string[] {
  return legalBar(content, content.skillTree.map((node: SkillTreeNodeDef): string => node.id), level);
}

function deals(content: Content, skill: string): boolean {
  const def: SkillDef | undefined = content.skills.get(skill);
  return def !== undefined && def.delivery.type !== 'dash' && (def.damage.weaponPercent > 0 || def.damage.flatMax > 0);
}

export function bestFor(content: Content, kit: DuelKit, weapon: string, level: number): ScoredBuild {
  let best: ScoredBuild = scoreBuild(content, kit, weapon, [], level);
  for (const skill of treeSkills(content, level).filter((id: string): boolean => deals(content, id))) {
    const aim: Aim = { bar: (): readonly string[] => [skill], lift: needsUnlock(content, skill, level) ? skill : null };
    const found: ScoredBuild = search(content, kit, weapon, level, aim, []);
    if (found.score > best.score) best = found;
  }
  return best;
}

export function bareScore(content: Content, kit: DuelKit, weapon: string, lead: string | null, level: number): number {
  const bar: readonly string[] = lead === null ? legalBar(content, [], level) : [lead];
  return power(standing(content, kitEquipment(content, kit, weapon, level), [], bar, level));
}

export function treeLift(content: Content, kit: DuelKit, build: ScoredBuild, level: number): number {
  const bare: number = bareScore(content, kit, build.weapon, build.lead, level);
  return bare <= 0 ? 0 : build.score / bare;
}

export function completeBuild(content: Content, kit: DuelKit, weapon: string, route: readonly string[], level: number): ScoredBuild {
  const aim: Aim = { bar: (held: readonly string[]): readonly string[] => legalBar(content, held, level), lift: null };
  return search(content, kit, weapon, level, aim, route);
}

export function pathWeapon(content: Content, kit: DuelKit, path: string): string | null {
  return kit.weapons.find((id: string): boolean => {
    const base: ItemBaseDef | undefined = content.itemBases.get(id);
    const group: WeaponGroup | null = base === undefined ? null : weaponGroupOf(content, base);
    return group?.path === path;
  }) ?? null;
}
