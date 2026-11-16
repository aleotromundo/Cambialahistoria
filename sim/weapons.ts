import type { ChartGroup, Content, ItemBaseDef, SkillDef, SkillMod, SkillTarget, SkillTreeNodeDef, StatId, StatMod, WeaponGroup, WeaponKind } from './content/types.ts';
import type { Equipment } from './world/types.ts';

export function groupOfKind(content: Content, kind: WeaponKind): WeaponGroup | null {
  return content.chart.weaponGroups.find((group: WeaponGroup): boolean => group.kinds.includes(kind)) ?? null;
}

export function weaponGroup(content: Content, id: string): WeaponGroup | null {
  return content.chart.weaponGroups.find((group: WeaponGroup): boolean => group.id === id) ?? null;
}

export function heldGroup(content: Content, equipped: Equipment): string | null {
  const held = equipped.weapon;
  if (held === null) return null;
  const base: ItemBaseDef | undefined = content.itemBases.get(held.base);
  if (base === undefined || base.weaponKind === null) return null;
  return groupOfKind(content, base.weaponKind)?.id ?? null;
}

export function skillAllowed(skill: SkillDef, held: string | null): boolean {
  return skill.weapons.length === 0 || (held !== null && skill.weapons.includes(held));
}

export const ANY_WEAPON: string = '*';

export function weaponNeed(content: Content, groups: readonly string[], held: string | null): string | null {
  if (groups.length === 0 || held === ANY_WEAPON || (held !== null && groups.includes(held))) return null;
  const phrases: readonly string[] = content.chart.weaponGroups.filter((group: WeaponGroup): boolean => groups.includes(group.id)).map((group: WeaponGroup): string => group.needs);
  return phrases.length === 0 ? null : `Needs ${phrases.join(' or ')}`;
}

export function placeNeed(content: Content, node: SkillTreeNodeDef, held: string | null): string | null {
  return node.weapon === null ? null : weaponNeed(content, [node.weapon], held);
}

export const WEAPON_DAMAGE_STATS: ReadonlySet<StatId> = new Set<StatId>(['damagePercent', 'damageMin', 'damageMax', 'critChance', 'critMultiplier', 'attackSpeed']);

export function placeLive(node: SkillTreeNodeDef, held: string | null): boolean {
  return held === ANY_WEAPON || node.weapon === null || node.weapon === held;
}

export function liveStatMod(mod: StatMod): boolean {
  return !WEAPON_DAMAGE_STATS.has(mod.stat);
}

function weaponFree(content: Content, skill: string): boolean {
  return content.skills.get(skill)?.weapons.length === 0;
}

export function liveSkillMod(content: Content, mod: SkillMod): boolean {
  const target: SkillTarget = mod.target;
  if (target.type === 'skill') return weaponFree(content, target.skill);
  const members: readonly string[] = content.chart.groups.find((group: ChartGroup): boolean => group.id === target.group)?.skills ?? [];
  return members.length > 0 && members.every((skill: string): boolean => weaponFree(content, skill));
}

export function placeBound(content: Content, node: SkillTreeNodeDef): boolean {
  if (node.weapon === null) return false;
  return node.variants.length > 0 || node.triggers.length > 0 || node.statMods.some((mod: StatMod): boolean => !liveStatMod(mod)) || node.skillMods.some((mod: SkillMod): boolean => !liveSkillMod(content, mod));
}

export function heldPlace(content: Content, node: SkillTreeNodeDef, held: string | null): SkillTreeNodeDef {
  if (placeLive(node, held)) return node;
  return { ...node, statMods: node.statMods.filter(liveStatMod), skillMods: node.skillMods.filter((mod: SkillMod): boolean => liveSkillMod(content, mod)), variants: [], triggers: [] };
}
