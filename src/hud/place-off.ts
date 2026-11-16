import type { Content, PowerEffect, PowerTriggerDef, SkillMod, SkillTreeNodeDef, SkillVariant, StatMod, WeaponGroup } from '../../sim/content/types.ts';
import { itemName } from '../../sim/items.ts';
import { describeMod, describeSkillMod } from '../../sim/stat-text.ts';
import { heldGroup, liveSkillMod, liveStatMod, placeLive, weaponGroup } from '../../sim/weapons.ts';
import type { Equipment, ItemInstance } from '../../sim/world/types.ts';

export interface PlaceOff {
  readonly lines: readonly string[];
  readonly need: string;
  readonly holding: string;
}

function skillName(content: Content, id: string): string {
  return content.skills.get(id)?.name ?? id;
}

function variantLine(content: Content, variant: SkillVariant): string {
  return `${skillName(content, variant.skill)} becomes ${skillName(content, variant.becomes)}`;
}

function effectLine(content: Content, effect: PowerEffect): string {
  switch (effect.type) {
    case 'cast':
      return skillName(content, effect.skill);
    case 'buff':
      return `${describeMod({ stat: effect.stat, op: effect.op, value: effect.value })} for ${effect.duration}s`;
    case 'empower':
      return effect.skillMods.map((mod: SkillMod): string => describeSkillMod(content, mod)).join(', ');
    case 'flask':
      return `+${effect.charges} flask charge`;
  }
  return '';
}

export function holdingLine(content: Content, equipped: Equipment): string {
  const weapon: ItemInstance | null = equipped.weapon;
  if (weapon === null) return 'Your hands are empty.';
  const group: WeaponGroup | null = weaponGroup(content, heldGroup(content, equipped) ?? '');
  return group === null ? `You hold ${itemName(content, weapon)}.` : `You hold ${group.needs}: ${itemName(content, weapon)}.`;
}

export function placeOff(content: Content, node: SkillTreeNodeDef, equipped: Equipment): PlaceOff | null {
  const group: WeaponGroup | null = node.weapon === null ? null : weaponGroup(content, node.weapon);
  if (group === null || placeLive(node, heldGroup(content, equipped))) return null;
  const lines: string[] = [
    ...node.statMods.filter((mod: StatMod): boolean => !liveStatMod(mod)).map(describeMod),
    ...node.skillMods.filter((mod: SkillMod): boolean => !liveSkillMod(content, mod)).map((mod: SkillMod): string => describeSkillMod(content, mod)),
    ...node.variants.map((variant: SkillVariant): string => variantLine(content, variant)),
    ...node.triggers.map((trigger: PowerTriggerDef): string => effectLine(content, trigger.effect)),
  ];
  if (lines.length === 0) return null;
  return { lines, need: `Off: needs ${group.needs}.`, holding: holdingLine(content, equipped) };
}
