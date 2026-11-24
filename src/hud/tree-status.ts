import type { Content, SkillTreeNodeDef, SpecialtyDef } from '../../sim/content/types.ts';
import { canAllocate, joinBlock } from '../../sim/progression.ts';
import { closingSpecialties } from '../../sim/specialty.ts';
import type { JoinBlock, RefundBlock } from '../../sim/progression.ts';
import { promptText, use } from './prompts.ts';

export const TREE_NODE_COST: number = 1;

export type TreeNodeStatus =
  | { readonly kind: 'allocated' }
  | { readonly kind: 'available' }
  | { readonly kind: 'no_points' }
  | { readonly kind: 'locked'; readonly needs: JoinBlock }
  | { readonly kind: 'closed'; readonly chosen: readonly string[] };

export function treeNodeStatus(content: Content, allocated: readonly string[], skillPoints: number, node: SkillTreeNodeDef): TreeNodeStatus {
  if (allocated.includes(node.id)) return { kind: 'allocated' };
  const closing: readonly SpecialtyDef[] = closingSpecialties(content, allocated, node);
  if (closing.length > 0) return { kind: 'closed', chosen: closing.map((entry: SpecialtyDef): string => entry.name) };
  const needs: JoinBlock | null = joinBlock(content, allocated, node);
  if (needs !== null) return { kind: 'locked', needs };
  return canAllocate(content, allocated, skillPoints, node.id) ? { kind: 'available' } : { kind: 'no_points' };
}

export function costLine(): string {
  return `Costo: ${TREE_NODE_COST} punto de habilidad`;
}

const SETTLED_LINES: Readonly<Record<Exclude<TreeNodeStatus['kind'], 'locked' | 'closed'>, string>> = {
  allocated: 'Asignado',
  available: 'asignar',
  no_points: 'No tienes puntos de habilidad para gastar',
};

const LOCKED_LINES: Readonly<Record<JoinBlock, string>> = {
  begin: 'Primero asigna puntos en un lugar inicial',
  connect: 'Conéctalo con un lugar que ya tengas',
  branch: 'Solo puede crecer tu grupo más grande de lugares',
};

function spokenList(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1] ?? ''}`;
}

export function closedLine(chosen: readonly string[]): string {
  return `Cerrado · sigues ${spokenList(chosen)} · abandona uno para seguir este`;
}

export function statusLine(status: TreeNodeStatus, touch: boolean): string {
  if (status.kind === 'locked') return LOCKED_LINES[status.needs];
  if (status.kind === 'closed') return closedLine(status.chosen);
  if (status.kind === 'available') return promptText(touch, use(SETTLED_LINES.available));
  return SETTLED_LINES[status.kind];
}

const TAKEN_LINES: Readonly<Record<RefundBlock, string>> = {
  not_held: 'Asignado',
  split: 'Asignado · devolverlo desconectaría los lugares que siguen',
  root: 'Asignado · todos tus lugares dependen de este',
};

export function takenLine(block: RefundBlock | null): string {
  return block === null ? 'Asignado' : TAKEN_LINES[block];
}

export function lockedLine(status: TreeNodeStatus, steps: number, touch: boolean): string {
  const line: string = statusLine(status, touch);
  return steps > 0 && status.kind !== 'closed' ? `${line} · ${steps * TREE_NODE_COST} puntos en la ruta iluminada` : line;
}

export function pointsPrompt(points: number, held: number): string {
  if (held === 0) return 'Elige dónde empezar';
  return `${points} ${points === 1 ? 'punto' : 'puntos'}: elige un lugar`;
}
