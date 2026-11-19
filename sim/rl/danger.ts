import { botInDanger } from '../bot.ts';
import type { Vec2 } from '../math.ts';
import type { World } from '../world/types.ts';
import { moveDirection } from './moves.ts';
import { MOVE_CHOICES, RL } from './contract.ts';

function dangerAlong(world: World, direction: Vec2 | null): number {
  const from: Vec2 = world.player.pos;
  if (direction === null) return botInDanger(world, from) ? 1 : 0;
  let hit: number = 0;
  for (const step of RL.dangerSteps) {
    if (botInDanger(world, { x: from.x + direction.x * step, z: from.z + direction.z * step })) hit += 1;
  }
  return hit / RL.dangerSteps.length;
}

export function dangerAround(world: World): number[] {
  return Array.from({ length: MOVE_CHOICES }, (_unused: unknown, move: number): number => dangerAlong(world, moveDirection(move)));
}
