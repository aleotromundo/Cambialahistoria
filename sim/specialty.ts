import type { Content, SkillTreeNodeDef, SpecialtyDef } from './content/types.ts';

export function specialtyOf(content: Content, id: string): SpecialtyDef | null {
  return content.chart.specialties.find((entry: SpecialtyDef): boolean => entry.id === id) ?? null;
}

const SPECIALTY_INDEX: WeakMap<Content, ReadonlyMap<string, string>> = new WeakMap<Content, ReadonlyMap<string, string>>();

function specialtyIndex(content: Content): ReadonlyMap<string, string> {
  const held: ReadonlyMap<string, string> | undefined = SPECIALTY_INDEX.get(content);
  if (held !== undefined) return held;
  const index: Map<string, string> = new Map<string, string>();
  for (const node of content.skillTree) if (node.specialty !== null) index.set(node.id, node.specialty);
  SPECIALTY_INDEX.set(content, index);
  return index;
}

function specialtyAt(content: Content, id: string): string | null {
  return specialtyIndex(content).get(id) ?? null;
}

export function heldSpecialties(content: Content, allocated: readonly string[]): string[] {
  const held: string[] = [];
  for (const id of allocated) {
    const specialty: string | null = specialtyAt(content, id);
    if (specialty !== null && !held.includes(specialty)) held.push(specialty);
  }
  return held;
}

export function closingSpecialties(content: Content, allocated: readonly string[], node: SkillTreeNodeDef): SpecialtyDef[] {
  if (node.specialty === null) return [];
  const held: readonly string[] = heldSpecialties(content, allocated);
  if (held.includes(node.specialty) || held.length < content.chart.specialtyLimit) return [];
  return held.flatMap((id: string): SpecialtyDef[] => {
    const found: SpecialtyDef | null = specialtyOf(content, id);
    return found === null ? [] : [found];
  });
}

export function specialtyClosed(content: Content, allocated: readonly string[], node: SkillTreeNodeDef): boolean {
  return closingSpecialties(content, allocated, node).length > 0;
}

export function specialtyPlaces(content: Content, id: string): SkillTreeNodeDef[] {
  return content.skillTree.filter((node: SkillTreeNodeDef): boolean => node.specialty === id);
}

export function withinSpecialtyLimit(content: Content, allocated: readonly string[]): string[] {
  const chosen: string[] = [];
  return allocated.filter((id: string): boolean => {
    const specialty: string | null = specialtyAt(content, id);
    if (specialty === null || chosen.includes(specialty)) return true;
    if (chosen.length >= content.chart.specialtyLimit) return false;
    chosen.push(specialty);
    return true;
  });
}

export function armPlaces(content: Content, path: string): SkillTreeNodeDef[] {
  return content.skillTree.filter((node: SkillTreeNodeDef): boolean => node.path === path && node.specialty === null && node.common === null && node.cluster === null);
}

export function opensSpecialty(content: Content, node: SkillTreeNodeDef): boolean {
  return node.specialty === null && content.skillTree.some((other: SkillTreeNodeDef): boolean => other.specialty !== null && other.requires.includes(node.id));
}

export function armBody(content: Content, path: string): SkillTreeNodeDef[] {
  return armPlaces(content, path).filter((node: SkillTreeNodeDef): boolean => !opensSpecialty(content, node));
}

export function armTip(content: Content, path: string): SkillTreeNodeDef | null {
  return farthestPlace(armBody(content, path));
}

export function farthestPlace(places: readonly SkillTreeNodeDef[]): SkillTreeNodeDef | null {
  let best: SkillTreeNodeDef | null = null;
  for (const node of places) if (best === null || Math.hypot(node.column, node.row) > Math.hypot(best.column, best.row)) best = node;
  return best;
}
