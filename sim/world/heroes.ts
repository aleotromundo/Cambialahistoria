import type { Actor, PlayerState, World } from './types.ts';

export function actorsOf(world: World): Actor[] {
  return [...world.heroes, ...world.monsters];
}

export function findHero(world: World, id: number): PlayerState | null {
  return world.heroes.find((hero: PlayerState): boolean => hero.id === id) ?? null;
}

export function isPrimary(world: World, actor: Actor): boolean {
  return actor === world.player;
}
