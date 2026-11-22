import type { Object3D } from 'three';
import { standHeight } from '../../sim/nav/climb.ts';
import type { MonsterState, World } from '../../sim/world/types.ts';
import { warnInConsole } from '../backend/console-log.ts';
import type { FramePacer } from './paced-work.ts';
import { workPaced } from './paced-work.ts';

export const BODY_RAISE = {
  budgetMs: 12,
} as const;

export interface RaiseFrom {
  readonly x: number;
  readonly z: number;
}

export interface RaiseDeps {
  readonly body: (monster: MonsterState) => Object3D | null;
  readonly pacer: FramePacer;
  readonly live: () => boolean;
}

function distance(monster: MonsterState, from: RaiseFrom): number {
  return Math.hypot(monster.pos.x - from.x, monster.pos.z - from.z);
}

export function raiseOrder(monsters: readonly MonsterState[], from: RaiseFrom): MonsterState[] {
  return monsters.filter((monster: MonsterState): boolean => monster.alive).toSorted((a: MonsterState, b: MonsterState): number => distance(a, from) - distance(b, from));
}

export function raiseBodies(world: World, deps: RaiseDeps): Promise<void> {
  const { zone, content } = world;
  const raise = (monster: MonsterState): void => {
    if (!deps.live()) return;
    deps.body(monster)?.position.set(monster.pos.x, standHeight(zone, content.props, monster.pos.x, monster.pos.z), monster.pos.z);
  };
  return workPaced(raiseOrder(world.monsters, world.player.pos), raise, deps.pacer, BODY_RAISE.budgetMs).catch((error: unknown): void => {
    warnInConsole(`Raising the bodies of ${zone.id} failed: ${String(error)}`);
  });
}
