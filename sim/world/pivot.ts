import type { Delivery, SkillDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { facingOf } from '../math.ts';
import { angleBetween, turnToward } from './movement.ts';
import type { Actor, World } from './types.ts';

export const TURNING = {
  monsterRate: 10,
  castCone: 0.25,
  still: 1e-6,
} as const;

export interface PivotState {
  readonly skill: SkillDef;
  readonly at: Vec2;
  readonly slot: number | null;
}

const FACES_AIM: Readonly<Record<Delivery['type'], boolean>> = {
  arc: true,
  projectile: true,
  mark: true,
  field: true,
  chain: true,
  area: true,
  beam: true,
  nova: false,
  dash: false,
  revive: false,
  blink: false,
};

export function facesAim(delivery: Delivery): boolean {
  return FACES_AIM[delivery.type];
}

export function turnRateOf(world: World, actor: Actor): number {
  return actor.kind === 'player' ? world.content.player.turnRate : TURNING.monsterRate;
}

export function needsPivot(actor: Actor, skill: SkillDef, direction: Vec2): boolean {
  if (!facesAim(skill.delivery) || Math.hypot(direction.x, direction.z) <= TURNING.still) return false;
  return Math.abs(angleBetween(actor.facing, facingOf(direction))) > TURNING.castCone;
}

export function turnInPlace(world: World, actor: Actor, direction: Vec2, dt: number): void {
  if (Math.hypot(direction.x, direction.z) <= TURNING.still) return;
  actor.facing = turnToward(actor.facing, facingOf(direction), turnRateOf(world, actor) * dt);
}
