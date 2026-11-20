import type { ChartPath, Content, SkillTreeNodeDef, SpecialtyDef } from '../../sim/content/types.ts';
import { heldSpecialties, specialtyOf } from '../../sim/specialty.ts';
import { createNameView } from './chart-label.ts';
import type { NameView } from './chart-label.ts';
import { specialtyLabels } from './chart-model.ts';
import type { ChartPoint, SpecialtyLabel } from './chart-model.ts';

export const TREE_SPECIALTY = {
  nameClass: 'chart-path-name specialty',
} as const;

export interface SpecialtyName {
  readonly id: string;
  readonly view: NameView;
}

function pathOf(content: Content, node: SkillTreeNodeDef): ChartPath | undefined {
  return content.chart.paths.find((entry: ChartPath): boolean => entry.id === node.path);
}

function specialtyFor(content: Content, node: SkillTreeNodeDef): SpecialtyDef | null {
  return node.specialty === null ? null : specialtyOf(content, node.specialty);
}

export function placeHome(content: Content, node: SkillTreeNodeDef): string {
  if (node.common !== null) return content.chart.common.name;
  const specialty: SpecialtyDef | null = specialtyFor(content, node);
  if (specialty !== null) return specialty.name;
  return pathOf(content, node)?.name ?? node.kind;
}

const COUNT_WORDS: readonly string[] = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];

function countWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

export function specialtyLine(content: Content, node: SkillTreeNodeDef): string | null {
  const path: ChartPath | undefined = pathOf(content, node);
  if (specialtyFor(content, node) === null || path === undefined) return null;
  return `A specialty of ${path.name}. Up to ${countWord(content.chart.specialtyLimit)} specialties can be followed across the whole tree.`;
}

export function createSpecialtyNames(content: Content, host: HTMLElement, place: (point: ChartPoint) => ChartPoint): SpecialtyName[] {
  return specialtyLabels(content).map((entry: SpecialtyLabel): SpecialtyName => ({ id: entry.specialty.id, view: createNameView(host, entry.specialty.name, entry.tint, place(entry.at), null, TREE_SPECIALTY.nameClass, false) }));
}

export function markSpecialtyNames(content: Content, names: readonly SpecialtyName[], allocated: readonly string[]): void {
  const chosen: readonly string[] = heldSpecialties(content, allocated);
  const full: boolean = chosen.length >= content.chart.specialtyLimit;
  for (const entry of names) {
    entry.view.mark('closed', full && !chosen.includes(entry.id));
    entry.view.mark('chosen', chosen.includes(entry.id));
  }
}
