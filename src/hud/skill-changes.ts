import type { Content, SkillTreeNodeDef, WeaponGroup } from '../../sim/content/types.ts';
import { activeChange, changesHeld } from '../../sim/progression.ts';
import type { HeldChange } from '../../sim/progression.ts';
import { ANY_WEAPON, placeLive, weaponGroup, weaponNeed } from '../../sim/weapons.ts';

export interface ChangeChoice {
  readonly becomes: string;
  readonly name: string;
  readonly lit: boolean;
  readonly live: boolean;
}

export interface SkillChanges {
  readonly skill: string;
  readonly title: string;
  readonly choices: readonly ChangeChoice[];
}

export interface SlotNeed {
  readonly tag: string;
  readonly line: string;
}

export interface ChangeOwner {
  readonly allocated: readonly string[];
  readonly changes: Readonly<Record<string, string>>;
  readonly wielding: string | null;
}

function nameOf(content: Content, id: string): string {
  return content.skills.get(id)?.name ?? id;
}

export function skillChanges(content: Content, owner: ChangeOwner, skill: string): SkillChanges | null {
  const held: readonly HeldChange[] = changesHeld(content, owner.allocated, skill);
  if (held.length < 2) return null;
  const active: string | null = activeChange(content, owner.allocated, owner.changes, skill, owner.wielding);
  return {
    skill,
    title: `${nameOf(content, skill)} uses`,
    choices: held.map((entry: HeldChange): ChangeChoice => ({ becomes: entry.becomes, name: entry.place.name, lit: entry.becomes === active, live: placeLive(entry.place, owner.wielding) })),
  };
}

export function placeChanges(content: Content, owner: ChangeOwner, node: SkillTreeNodeDef): SkillChanges[] {
  if (!owner.allocated.includes(node.id)) return [];
  const found: SkillChanges[] = [];
  for (const variant of node.variants) {
    if (found.some((entry: SkillChanges): boolean => entry.skill === variant.skill)) continue;
    const changes: SkillChanges | null = skillChanges(content, owner, variant.skill);
    if (changes !== null) found.push(changes);
  }
  return found;
}

export function changesShape(changes: readonly SkillChanges[]): string {
  return changes.map((entry: SkillChanges): string => `${entry.skill}=${entry.choices.map((choice: ChangeChoice): string => choice.becomes).join('|')}`).join(';');
}

export function needTag(content: Content, groups: readonly string[], held: string | null): string | null {
  if (groups.length === 0 || held === ANY_WEAPON || (held !== null && groups.includes(held))) return null;
  const names: readonly string[] = content.chart.weaponGroups.filter((group: WeaponGroup): boolean => groups.includes(group.id)).map((group: WeaponGroup): string => group.name);
  return names.length === 0 ? null : names.join(' / ');
}


export function slotNeed(content: Content, owner: ChangeOwner, skill: string, weapons: readonly string[]): SlotNeed | null {
  const tag: string | null = needTag(content, weapons, owner.wielding);
  const line: string | null = weaponNeed(content, weapons, owner.wielding);
  if (tag !== null && line !== null) return { tag, line };
  if (activeChange(content, owner.allocated, owner.changes, skill, owner.wielding) !== null) return null;
  const wanted: string | null = activeChange(content, owner.allocated, owner.changes, skill);
  const place: SkillTreeNodeDef | undefined = changesHeld(content, owner.allocated, skill).find((entry: HeldChange): boolean => entry.becomes === wanted)?.place;
  if (place === undefined || place.weapon === null) return null;
  const group: WeaponGroup | null = weaponGroup(content, place.weapon);
  return group === null ? null : { tag: group.name, line: `${place.name} needs ${group.needs}` };
}
