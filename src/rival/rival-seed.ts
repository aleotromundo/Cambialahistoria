const RIVAL_SEED = {
  param: 'rivalSeed',
  pattern: /^\d+$/,
  seeds: 2147483647,
} as const;

export function fixedRivalSeed(search: string, dev: boolean): number | null {
  if (!dev) return null;
  const value: string | null = new URLSearchParams(search).get(RIVAL_SEED.param);
  return value !== null && RIVAL_SEED.pattern.test(value) ? Number(value) : null;
}

export function rivalSeedSource(search: string, dev: boolean, random: () => number = Math.random): () => number {
  const fixed: number | null = fixedRivalSeed(search, dev);
  return (): number => fixed ?? Math.floor(random() * RIVAL_SEED.seeds);
}
