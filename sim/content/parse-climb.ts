import type { ReadonlyVec2 } from '../math.ts';
import type { PropClimb } from './prop-types.ts';
import type { Fields } from './read.ts';
import { ContentError, fields, items, positive } from './read.ts';

function corner(value: unknown, where: string): ReadonlyVec2 {
  const pair: readonly unknown[] = items(value, where);
  const [x, z] = pair;
  if (pair.length !== 2 || typeof x !== 'number' || typeof z !== 'number') throw new ContentError(where, 'expected an [x, z] pair of numbers');
  return { x, z };
}

function wall(value: unknown, where: string): readonly ReadonlyVec2[] {
  const outline: ReadonlyVec2[] = items(value, where).map((point: unknown, index: number): ReadonlyVec2 => corner(point, `${where}[${index}]`));
  if (outline.length < 3) throw new ContentError(where, 'a wall needs at least three corners');
  return outline;
}

export function propClimb(value: unknown, where: string): PropClimb | null {
  if (value === null || value === undefined) return null;
  const source: Fields = fields(value, where);
  const steps: number = positive(source, 'steps', where);
  if (!Number.isInteger(steps)) throw new ContentError(`${where}.steps`, 'a climb has a whole number of steps');
  const walls: readonly (readonly ReadonlyVec2[])[] = source['walls'] === undefined ? [] : items(source['walls'], `${where}.walls`).map((listed: unknown, index: number): readonly ReadonlyVec2[] => wall(listed, `${where}.walls[${index}]`));
  return { steps, rise: positive(source, 'rise', where), depth: positive(source, 'depth', where), width: positive(source, 'width', where), walls };
}
