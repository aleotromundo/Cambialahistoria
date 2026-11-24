import type { Content } from '../../sim/content/types.ts';
import { weaponGroup } from '../../sim/weapons.ts';
import type { ArmedWhere } from '../../sim/world/types.ts';

export interface ArmedLine {
  readonly title: string;
  readonly subtitle: string | null;
}

const PLACES: Readonly<Record<ArmedWhere | 'unknown', string>> = { bag: 'en tu bolsa', ground: 'a tus pies', unknown: 'para vos' };

export function armedLine(content: Content, group: string, base: string, where: ArmedWhere | null): ArmedLine {
  const needs: string = weaponGroup(content, group)?.needs ?? 'un arma';
  return { title: `Se preparó ${needs} ${where === null ? PLACES.unknown : PLACES[where]}`, subtitle: content.itemBases.get(base)?.name ?? null };
}
