import type { Content, SkillTreeNodeDef } from '../content/types.ts';
import { joinBlock } from '../progression.ts';
import type { Rng } from '../rng.ts';
import { specialtyClosed } from '../specialty.ts';
import type { Build } from './build.ts';
import { basicSkill, bookSkills, BUILD, buildPoints, mustBeLegal, rollSkill } from './build.ts';
import type { DuelKit } from './kit.ts';

export const RIVAL_BUILD = {
  name: 'Rival',
} as const;

function pick<T>(rng: Rng, list: readonly T[]): T | null {
  return list.length === 0 ? null : (list[rng.int(0, list.length - 1)] ?? null);
}

export function joinable(content: Content, held: readonly string[]): SkillTreeNodeDef[] {
  return content.skillTree.filter((node: SkillTreeNodeDef): boolean => !held.includes(node.id) && joinBlock(content, held, node) === null && !specialtyClosed(content, held, node));
}

export function rivalRoute(content: Content, rng: Rng, level: number): string[] {
  const points: number = buildPoints(content, level);
  const held: string[] = [];
  while (held.length < points) {
    const next: SkillTreeNodeDef | null = pick(rng, joinable(content, held));
    if (next === null) break;
    held.push(next.id);
  }
  return held;
}

function rivalSkills(content: Content, rng: Rng, level: number, route: readonly string[]): string[] {
  const always: ReadonlySet<string | null> = new Set<string | null>([basicSkill(content), rollSkill(content)]);
  const unlocked: string[] = route.flatMap((id: string): string[] => {
    const unlock: string | null = content.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === id)?.unlock ?? null;
    return unlock === null ? [] : [unlock];
  });
  const offered: string[] = [...new Set<string>([...bookSkills(content, level), ...unlocked])].filter((skill: string): boolean => content.skills.has(skill) && !always.has(skill));
  const chosen: string[] = [];
  while (chosen.length < BUILD.slots.length && offered.length > 0) {
    const index: number = rng.int(0, offered.length - 1);
    const [skill] = offered.splice(index, 1);
    if (skill !== undefined) chosen.push(skill);
  }
  return chosen;
}

export function rivalBuild(content: Content, kit: DuelKit, rng: Rng, level: number): Build {
  const weapon: string | null = pick(rng, kit.weapons);
  if (weapon === null) throw new Error('the duel kit has no standard weapon to arm a rival with');
  const route: string[] = rivalRoute(content, rng, level);
  const skills: string[] = rivalSkills(content, rng, level, route);
  const hero: string | null = pick(rng, content.player.heroes)?.id ?? null;
  return mustBeLegal(content, kit, { name: RIVAL_BUILD.name, weapon, skills, route, hero }, 'rival build', level);
}
