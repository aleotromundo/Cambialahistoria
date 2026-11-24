import type { Content, SkillCategory, SkillDef, SkillTreeNodeDef } from '../../sim/content/types.ts';
import { placeLearned } from '../../sim/skill-book.ts';

export const CATEGORY_NAMES: Readonly<Record<SkillCategory, string>> = {
  none: '',
  area: 'Área',
  single: 'Objetivo único',
  chain: 'En cadena',
  charged: 'Cargada',
  mark: 'Marca',
  movement: 'Movimiento',
  defence: 'Defensa',
  channel: 'Canalizada',
  lasting: 'Duradera',
  melee: 'Cuerpo a cuerpo',
  root: 'Inmovilización',
  revive: 'Revivir',
};

export interface AbilityCard {
  readonly skill: SkillDef;
  readonly tags: string;
  readonly cost: string;
  readonly slot: number | null;
}

export function damageWord(skill: SkillDef): string {
  const weapon: boolean = skill.damage.weaponPercent > 0;
  const storm: boolean = skill.damage.flatMax > 0;
  if (weapon && storm) return 'Daño de arma y de tormenta';
  if (weapon) return 'Daño de arma';
  if (storm) return 'Daño de tormenta';
  return 'Sin daño';
}

function seconds(value: number): string {
  return `${Number(value.toFixed(1))}s`;
}

export function costWords(skill: SkillDef): string {
  const mana: string = skill.manaCost > 0 ? `${skill.manaCost} de maná` : 'Sin maná';
  return skill.cooldown > 0 ? `${mana} · ${seconds(skill.cooldown)} de recarga` : mana;
}

export function abilityCard(content: Content, node: SkillTreeNodeDef, bar: readonly (string | null)[]): AbilityCard | null {
  const skill: SkillDef | undefined = node.unlock === null ? undefined : content.skills.get(node.unlock);
  if (skill === undefined) return null;
  const slot: number = placeLearned(content, bar, skill.id).indexOf(skill.id);
  const tags: string = [CATEGORY_NAMES[skill.category], damageWord(skill)].filter((word: string): boolean => word.length > 0).join(' · ');
  return { skill, tags, cost: costWords(skill), slot: slot < 0 ? null : slot };
}
