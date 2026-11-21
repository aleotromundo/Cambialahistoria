import type { Content, ItemBaseDef, SkillTreeNodeDef, WeaponGroup } from '../content/types.ts';
import { canRefund, findNode, isStartingPlace, joinBlock, placeLinks } from '../progression.ts';
import type { Rng } from '../rng.ts';
import type { LevelRange } from './curriculum.ts';
import { pickLevel } from './curriculum.ts';
import { createRng, pickWeighted } from '../rng.ts';
import { specialtyClosed } from '../specialty.ts';
import type { Build } from './build.ts';
import { basicSkill, BUILD, bookSkills, buildPoints, buildProblems, rollSkill } from './build.ts';
import type { DuelKit } from './kit.ts';
import { weaponGroupOf } from './kit.ts';

export const TREE_BUILD = {
  offWeapon: 0.15,
  unlocks: 3,
  seedSalt: 40503,
  levelSalt: 69313,
  barSkills: { min: 1, max: BUILD.slots.length },
  addSkill: 0.5,
  name: 'Tree build',
} as const;

export const MUTATIONS = ['place', 'skill', 'weapon'] as const;
export type Mutation = (typeof MUTATIONS)[number];

interface WeightedPlace {
  readonly node: SkillTreeNodeDef;
  readonly weight: number;
}

function pick<T>(rng: Rng, list: readonly T[]): T | null {
  return list.length === 0 ? null : (list[rng.int(0, list.length - 1)] ?? null);
}

function shuffled<T>(rng: Rng, list: readonly T[]): T[] {
  const out: T[] = [...list];
  for (let index: number = out.length - 1; index > 0; index -= 1) {
    const swap: number = rng.int(0, index);
    const held: T | undefined = out[index];
    const other: T | undefined = out[swap];
    if (held === undefined || other === undefined) continue;
    out[index] = other;
    out[swap] = held;
  }
  return out;
}

export function weaponGroupId(content: Content, weapon: string): string | null {
  const base: ItemBaseDef | undefined = content.itemBases.get(weapon);
  const group: WeaponGroup | null = base === undefined ? null : weaponGroupOf(content, base);
  return group?.id ?? null;
}

function joins(content: Content, route: readonly string[], node: SkillTreeNodeDef): boolean {
  return !route.includes(node.id) && joinBlock(content, route, node) === null && !specialtyClosed(content, route, node);
}

export function joinablePlaces(content: Content, route: readonly string[]): SkillTreeNodeDef[] {
  if (route.length === 0) return content.skillTree.filter((node: SkillTreeNodeDef): boolean => isStartingPlace(node) && joins(content, route, node));
  const links: ReadonlyMap<string, readonly string[]> = placeLinks(content);
  const near: Set<string> = new Set<string>();
  for (const id of route) for (const next of links.get(id) ?? []) if (!route.includes(next)) near.add(next);
  return [...near].flatMap((id: string): SkillTreeNodeDef[] => {
    const node: SkillTreeNodeDef | null = findNode(content, id);
    return node !== null && joins(content, route, node) ? [node] : [];
  });
}

function placeWeight(node: SkillTreeNodeDef, group: string | null): number {
  const aimed: number = node.weapon === null || node.weapon === group ? 1 : TREE_BUILD.offWeapon;
  return node.unlock === null ? aimed : aimed * TREE_BUILD.unlocks;
}

function takePlace(content: Content, rng: Rng, route: readonly string[], group: string | null, skip: string | null): string | null {
  const options: WeightedPlace[] = joinablePlaces(content, route).filter((node: SkillTreeNodeDef): boolean => node.id !== skip).map((node: SkillTreeNodeDef): WeightedPlace => ({ node, weight: placeWeight(node, group) }));
  return pickWeighted(rng, options)?.node.id ?? null;
}

export function growRoute(content: Content, rng: Rng, start: readonly string[], points: number, group: string | null, skip: string | null = null): string[] {
  const route: string[] = [...start];
  while (route.length < points) {
    const next: string | null = takePlace(content, rng, route, group, skip);
    if (next === null) break;
    route.push(next);
  }
  return route;
}

export function barChoices(content: Content, route: readonly string[], level: number): string[] {
  const always: ReadonlySet<string | null> = new Set<string | null>([basicSkill(content), rollSkill(content)]);
  const unlocked: string[] = route.flatMap((id: string): string[] => {
    const unlock: string | null = findNode(content, id)?.unlock ?? null;
    return unlock === null ? [] : [unlock];
  });
  return [...new Set<string>([...bookSkills(content, level), ...unlocked])].filter((skill: string): boolean => content.skills.has(skill) && !always.has(skill));
}

function drawBar(rng: Rng, choices: readonly string[]): string[] {
  const size: number = Math.min(choices.length, rng.int(TREE_BUILD.barSkills.min, TREE_BUILD.barSkills.max));
  return shuffled(rng, choices).slice(0, size);
}

export function randomBuild(content: Content, kit: DuelKit, rng: Rng, level: number): Build {
  const weapon: string | null = pick(rng, kit.weapons);
  if (weapon === null) throw new Error('the duel kit lists no standard weapon');
  const route: string[] = growRoute(content, rng, [], buildPoints(content, level), weaponGroupId(content, weapon));
  return { name: `${TREE_BUILD.name} ${level}`, weapon, skills: drawBar(rng, barChoices(content, route, level)), route, hero: null };
}

export function treeBuildFor(content: Content, kit: DuelKit, seed: number, level: number): Build {
  return randomBuild(content, kit, createRng(seed + TREE_BUILD.seedSalt), level);
}

export function treeLevel(seed: number, weights: readonly number[], range: LevelRange): number {
  const rng: Rng = createRng(seed + TREE_BUILD.levelSalt);
  return pickLevel(rng, weights, range) ?? rng.int(range.min, range.max);
}

export function orderRoute(content: Content, places: readonly string[]): string[] | null {
  const left: string[] = [...places];
  const route: string[] = [];
  while (left.length > 0) {
    const at: number = left.findIndex((id: string): boolean => {
      const node: SkillTreeNodeDef | null = findNode(content, id);
      return node !== null && joins(content, route, node);
    });
    if (at < 0) return null;
    route.push(...left.splice(at, 1));
  }
  return route;
}

function keptSkills(content: Content, skills: readonly string[], route: readonly string[], level: number): string[] {
  const choices: readonly string[] = barChoices(content, route, level);
  return skills.filter((skill: string): boolean => choices.includes(skill));
}

function swapPlace(content: Content, rng: Rng, build: Build, level: number): Build | null {
  const dropped: string | null = pick(rng, build.route.filter((id: string): boolean => canRefund(content, build.route, id)));
  if (dropped === null) return null;
  const rest: string[] | null = orderRoute(content, build.route.filter((id: string): boolean => id !== dropped));
  if (rest === null) return null;
  const taken: string | null = takePlace(content, rng, rest, weaponGroupId(content, build.weapon), dropped);
  if (taken === null) return null;
  const route: string[] = growRoute(content, rng, [...rest, taken], buildPoints(content, level), weaponGroupId(content, build.weapon), dropped);
  return { ...build, route, skills: keptSkills(content, build.skills, route, level) };
}

function swapSkill(content: Content, rng: Rng, build: Build, level: number): Build | null {
  const spare: string[] = barChoices(content, build.route, level).filter((skill: string): boolean => !build.skills.includes(skill));
  const fresh: string | null = pick(rng, spare);
  if (fresh === null) return null;
  if (build.skills.length === 0 || (build.skills.length < BUILD.slots.length && rng.chance(TREE_BUILD.addSkill))) return { ...build, skills: [...build.skills, fresh] };
  const out: number = rng.int(0, build.skills.length - 1);
  return { ...build, skills: build.skills.map((skill: string, index: number): string => (index === out ? fresh : skill)) };
}

function swapWeapon(kit: DuelKit, rng: Rng, build: Build): Build | null {
  const weapon: string | null = pick(rng, kit.weapons.filter((id: string): boolean => id !== build.weapon));
  return weapon === null ? null : { ...build, weapon };
}

function mutated(content: Content, kit: DuelKit, rng: Rng, build: Build, level: number, kind: Mutation): Build | null {
  switch (kind) {
    case 'place':
      return swapPlace(content, rng, build, level);
    case 'skill':
      return swapSkill(content, rng, build, level);
    case 'weapon':
      return swapWeapon(kit, rng, build);
  }
  return null;
}

export function mutateBuild(content: Content, kit: DuelKit, rng: Rng, build: Build, level: number): Build {
  for (const kind of shuffled(rng, MUTATIONS)) {
    const next: Build | null = mutated(content, kit, rng, build, level, kind);
    if (next !== null && buildProblems(content, kit, next, level).length === 0) return next;
  }
  return build;
}
