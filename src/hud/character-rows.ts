import type { CharacterSheet, Figure } from '../../sim/character-sheet.ts';
import type { StatId } from '../../sim/content/types.ts';
import { ARMOUR_HALF_POINT } from '../../sim/stats.ts';

export type Source = 'base' | 'gear' | 'tree' | 'total';

export interface SheetRow {
  readonly name: string;
  readonly note: string | null;
  readonly read: (sheet: CharacterSheet, source: Source) => readonly number[];
  readonly format: (values: readonly number[]) => string;
}

const whole = (values: readonly number[]): string => String(Math.round(values[0] ?? 0));
const tenths = (values: readonly number[]): string => (values[0] ?? 0).toFixed(1);
const perSecond = (values: readonly number[]): string => `${tenths(values)}/s`;
const percent = (values: readonly number[]): string => `${Math.round((values[0] ?? 0) * 100)}%`;
const bonus = (values: readonly number[]): string => `+${percent(values)}`;
const percentTenth = (values: readonly number[]): string => `${((values[0] ?? 0) * 100).toFixed(1)}%`;
const range = (values: readonly number[]): string => `${Math.round(values[0] ?? 0)}–${Math.round(values[1] ?? 0)}`;

function stat(sheet: CharacterSheet, id: StatId, source: Source): number {
  const figure: Figure = sheet.figures[id];
  return source === 'total' ? figure.total : figure[source];
}

function single(name: string, id: StatId, format: SheetRow['format']): SheetRow {
  return { name, note: null, read: (sheet: CharacterSheet, source: Source): readonly number[] => [stat(sheet, id, source)], format };
}

export const DEFENCE_ROWS: readonly SheetRow[] = [
  single('Vida', 'maxLife', whole),
  single('Maná', 'maxMana', whole),
  single('Regeneración de vida', 'lifeRegen', perSecond),
  single('Regeneración de maná', 'manaRegen', perSecond),
  single('Armadura', 'armour', whole),
  {
    name: 'Reducción de daño por golpe',
    note: `Cada golpe recibido se reduce según la fórmula armadura ÷ (armadura + ${ARMOUR_HALF_POINT}), sin importar el nivel.`,
    read: (sheet: CharacterSheet, source: Source): readonly number[] => (source === 'total' ? [sheet.armourReduction] : [0]),
    format: percent,
  },
  {
    name: 'Resistencia a la Tormenta',
    note: 'Reduce el daño de Tormenta, hasta el límite. Los niveles más profundos de Tormenta reducen parte de esta resistencia.',
    read: (sheet: CharacterSheet, source: Source): readonly number[] => [stat(sheet, 'stormResist', source)],
    format: percent,
  },
  {
    name: 'Resistencia al Hielo',
    note: 'Reduce el daño de Hielo, hasta el límite. Los niveles más profundos de Tormenta reducen parte de esta resistencia.',
    read: (sheet: CharacterSheet, source: Source): readonly number[] => [stat(sheet, 'frostResist', source)],
    format: percent,
  },
  single('Velocidad de movimiento', 'moveSpeed', tenths),
];

export const OFFENCE_ROWS: readonly SheetRow[] = [
  {
    name: 'Daño de arma',
    note: null,
    read: (sheet: CharacterSheet, source: Source): readonly number[] => [stat(sheet, 'damageMin', source), stat(sheet, 'damageMax', source)],
    format: range,
  },
  single('Bonificación de daño', 'damagePercent', bonus),
  single('Velocidad de ataque', 'attackSpeed', percent),
  single('Probabilidad de golpe crítico', 'critChance', percentTenth),
  single('Multiplicador de golpe crítico', 'critMultiplier', percent),
  single('Oro encontrado', 'goldFind', percent),
];

export const SOURCES: readonly { readonly source: Source; readonly title: string }[] = [
  { source: 'base', title: 'Base' },
  { source: 'gear', title: 'Equipo' },
  { source: 'tree', title: 'Árbol de habilidades' },
];
