import type { Rng } from '../rng.ts';
import { ARENA } from './arena.ts';

export const CURRICULUM = {
  seedSalt: 2654435761,
} as const;

export interface LevelRange {
  readonly min: number;
  readonly max: number;
}

export function levelCount(range: LevelRange = ARENA.levels): number {
  return range.max - range.min + 1;
}

export function readLevelRange(raw: unknown): LevelRange {
  if (raw === undefined || raw === null) return ARENA.levels;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('a level range is {min, max}');
  const min: unknown = 'min' in raw ? raw.min : undefined;
  const max: unknown = 'max' in raw ? raw.max : undefined;
  if (typeof min !== 'number' || typeof max !== 'number' || !Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) throw new Error('a level range runs between two whole levels of 1 or more, lowest first');
  return { min, max };
}

export function rangeProblems(range: LevelRange, top: number): string[] {
  return range.max > top ? [`the level range ${range.min}-${range.max} runs past the top level ${top}`] : [];
}

export function sameRange(left: LevelRange, right: LevelRange): boolean {
  return left.min === right.min && left.max === right.max;
}

export function readLevelWeights(raw: unknown, range: LevelRange = ARENA.levels): number[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error('level weights must be a list');
  const weights: number[] = raw.map((value: unknown): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('a level weight must be a number of zero or more');
    return value;
  });
  if (weights.length === 0) return [];
  if (weights.length !== levelCount(range)) throw new Error(`level weights must name all ${levelCount(range)} levels from ${range.min} to ${range.max}`);
  if (weights.every((weight: number): boolean => weight === 0)) throw new Error('at least one level weight must be above zero');
  return weights;
}

export function pickLevel(rng: Rng, weights: readonly number[], range: LevelRange = ARENA.levels): number | null {
  const total: number = weights.reduce((sum: number, weight: number): number => sum + weight, 0);
  if (total <= 0) return null;
  let left: number = rng.next() * total;
  for (let index: number = 0; index < weights.length; index += 1) {
    left -= weights[index] ?? 0;
    if (left < 0) return range.min + index;
  }
  const last: number = weights.findLastIndex((weight: number): boolean => weight > 0);
  return range.min + last;
}

export function levelIn(rng: Rng, weights: readonly number[], range: LevelRange): number | null {
  const picked: number | null = pickLevel(rng, weights, range);
  if (picked !== null || sameRange(range, ARENA.levels)) return picked;
  return rng.int(range.min, range.max);
}
