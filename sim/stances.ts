import type { Content, SkillTreeNodeDef, Stance, StanceMod, StatMod } from './content/types.ts';
import { STANCES } from './content/types.ts';
import { allocatedNodes } from './stats.ts';
import type { PlayerState } from './world/types.ts';

export interface StanceReading {
  readonly moving: boolean;
  readonly life: number;
  readonly maxLife: number;
}

function holds(content: Content, stance: Stance, reading: StanceReading): boolean {
  switch (stance) {
    case 'moving':
      return reading.moving;
    case 'still':
      return !reading.moving;
    case 'low_life':
      return reading.maxLife > 0 && reading.life <= reading.maxLife * content.chart.lowLife;
    case 'full_life':
      return reading.maxLife > 0 && reading.life >= reading.maxLife;
  }
  return false;
}

export function placedStances(content: Content, allocated: readonly string[], wielding: string | null): StanceMod[] {
  return allocatedNodes(content, allocated, wielding).flatMap((node: SkillTreeNodeDef): readonly StanceMod[] => node.stances);
}

export function liveStances(content: Content, held: readonly StanceMod[], reading: StanceReading): Stance[] {
  return STANCES.filter((stance: Stance): boolean => held.some((mod: StanceMod): boolean => mod.when === stance) && holds(content, stance, reading));
}

export function stanceMods(held: readonly StanceMod[], live: readonly Stance[]): StatMod[] {
  return held.filter((mod: StanceMod): boolean => live.includes(mod.when)).flatMap((mod: StanceMod): readonly StatMod[] => mod.statMods);
}

export function heroStanceMods(content: Content, player: PlayerState): StatMod[] {
  return stanceMods(placedStances(content, player.allocated, player.wielding), player.powers.stances);
}

interface StanceCache {
  readonly content: Content;
  readonly allocated: readonly string[];
  readonly wielding: string | null;
  readonly held: readonly StanceMod[];
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id: string, index: number): boolean => b[index] === id);
}

const HELD: WeakMap<PlayerState, StanceCache> = new WeakMap<PlayerState, StanceCache>();

function heldStances(content: Content, player: PlayerState): readonly StanceMod[] {
  const cached: StanceCache | undefined = HELD.get(player);
  if (cached !== undefined && cached.content === content && cached.wielding === player.wielding && sameList(cached.allocated, player.allocated)) return cached.held;
  const held: readonly StanceMod[] = placedStances(content, player.allocated, player.wielding);
  HELD.set(player, { content, allocated: [...player.allocated], wielding: player.wielding, held });
  return held;
}

export function stepStances(content: Content, player: PlayerState): boolean {
  const live: readonly Stance[] = liveStances(content, heldStances(content, player), player);
  const before: readonly Stance[] = player.powers.stances;
  if (live.length === before.length && live.every((stance: Stance, index: number): boolean => before[index] === stance)) return false;
  player.powers.stances = [...live];
  return true;
}
