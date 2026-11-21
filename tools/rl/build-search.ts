import type { Fields } from '../../sim/content/read.ts';
import { choice, each, fields, numeric } from '../../sim/content/read.ts';
import type { Content } from '../../sim/content/types.ts';
import type { Rng } from '../../sim/rng.ts';
import { createRng } from '../../sim/rng.ts';
import type { Build } from '../../sim/rl/build.ts';
import { buildProblems, checkedLevel, readBuild } from '../../sim/rl/build.ts';
import { DUEL_KIT } from '../../sim/rl/kit.ts';
import { mutateBuild, treeBuildFor } from '../../sim/rl/tree-build.ts';

export const SEARCH_ACTIONS = ['random', 'mutate', 'check'] as const;
export type SearchAction = (typeof SEARCH_ACTIONS)[number];

export type SearchRequest =
  | { readonly action: 'random'; readonly level: number; readonly seeds: readonly number[] }
  | { readonly action: 'mutate'; readonly level: number; readonly seed: number; readonly builds: readonly Build[] }
  | { readonly action: 'check'; readonly level: number; readonly builds: readonly Build[] };

export type SearchAnswer = { readonly builds: readonly Build[] } | { readonly problems: readonly (readonly string[])[] };

function wholeNumber(source: Fields, key: string, where: string): number {
  const value: number = numeric(source, key, where);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${where}: ${key} must be a whole number of zero or more`);
  return value;
}

function buildsOf(source: Fields, where: string): Build[] {
  return each(source['builds'], `${where}.builds`, (entry: unknown, at: string): Build => readBuild(entry, at));
}

export function readSearchRequest(raw: unknown): SearchRequest {
  const where: string = 'build search request';
  const source: Fields = fields(raw, where);
  const action: SearchAction = choice(source, 'action', SEARCH_ACTIONS, where);
  const level: number = wholeNumber(source, 'level', where);
  switch (action) {
    case 'random':
      return { action, level, seeds: each(source['seeds'], `${where}.seeds`, (entry: unknown, at: string): number => wholeNumber({ seed: entry }, 'seed', at)) };
    case 'mutate':
      return { action, level, seed: wholeNumber(source, 'seed', where), builds: buildsOf(source, where) };
    case 'check':
      return { action, level, builds: buildsOf(source, where) };
  }
  throw new Error(`${where}: unknown action`);
}

export function answerSearch(content: Content, request: SearchRequest): SearchAnswer {
  const level: number = checkedLevel(content, request.level);
  switch (request.action) {
    case 'random':
      return { builds: request.seeds.map((seed: number): Build => treeBuildFor(content, DUEL_KIT, seed, level)) };
    case 'mutate': {
      const rng: Rng = createRng(request.seed);
      return { builds: request.builds.map((build: Build): Build => mutateBuild(content, DUEL_KIT, rng, build, level)) };
    }
    case 'check':
      return { problems: request.builds.map((build: Build): string[] => buildProblems(content, DUEL_KIT, build, level)) };
  }
  throw new Error('unknown build search action');
}
