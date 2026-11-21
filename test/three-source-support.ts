import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const THREE_SOURCE: string = join(dirname(createRequire(import.meta.url).resolve('three')), '..', 'src');

export function threeSource(...path: readonly string[]): string {
  return readFileSync(join(THREE_SOURCE, ...path), 'utf8');
}

export function threeFunction(source: string, opening: string): string {
  const start: number = source.indexOf(opening);
  if (start < 0) throw new Error(`three.js no longer has ${opening}`);
  const next: number = source.indexOf('\n\t\tfunction ', start + opening.length);
  const sibling: number = source.indexOf('\n\tfunction ', start + opening.length);
  const ends: readonly number[] = [next, sibling].filter((at: number): boolean => at > start);
  return source.slice(start, ends.length === 0 ? source.length : Math.min(...ends));
}

export function missingLines(source: string, lines: readonly string[]): readonly string[] {
  return lines.filter((line: string): boolean => !source.includes(line));
}
