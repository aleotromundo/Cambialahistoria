import type { ReadonlyVec2 } from '../sim/math.ts';
import { facingOf } from '../sim/math.ts';
import type { ActorState } from '../sim/world/types.ts';

export function faceAt(actor: ActorState, at: ReadonlyVec2): void {
  const toward: ReadonlyVec2 = { x: at.x - actor.pos.x, z: at.z - actor.pos.z };
  if (Math.hypot(toward.x, toward.z) > 0) actor.facing = facingOf(toward);
}
