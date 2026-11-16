import type { ChartPath, Content, ItemBaseDef, SkillTreeNodeDef, WeaponGroup } from '../../sim/content/types.ts';
import { groupOfKind, placeBound, weaponGroup } from '../../sim/weapons.ts';
import { el, label } from './dom.ts';
import { iconSvg } from './icons.ts';

export function baseFamily(content: Content, base: ItemBaseDef | null): WeaponGroup | null {
  return base === null || base.weaponKind === null ? null : groupOfKind(content, base.weaponKind);
}

export function placeFamily(content: Content, node: SkillTreeNodeDef): WeaponGroup | null {
  return node.weapon === null || !placeBound(content, node) ? null : weaponGroup(content, node.weapon);
}

export const ANY_WEAPON_LINE: string = 'Works with any weapon';

export function familyArm(content: Content, group: WeaponGroup): string {
  return content.chart.paths.find((path: ChartPath): boolean => path.id === group.path)?.name ?? group.path;
}

export function familyLine(content: Content, group: WeaponGroup): string {
  return `${group.name} · ${familyArm(content, group)} places work with it`;
}

export function needLine(group: WeaponGroup): string {
  return `Needs ${group.needs}: ${group.holds}`;
}

export function pathFamily(content: Content, path: string): WeaponGroup | null {
  return content.chart.weaponGroups.find((group: WeaponGroup): boolean => group.path === path) ?? null;
}

export function familyMark(group: WeaponGroup, className: string, parent: HTMLElement | null): HTMLSpanElement {
  const mark: HTMLSpanElement = el('span', `family-mark ${className}`, parent);
  mark.innerHTML = iconSvg(group.icon);
  return mark;
}

export function familyRow(group: WeaponGroup, className: string, text: string, parent: HTMLElement | null): HTMLDivElement {
  const row: HTMLDivElement = el('div', `family-row ${className}`, parent);
  familyMark(group, 'family-row-mark', row);
  label('family-row-text', text, row);
  return row;
}
