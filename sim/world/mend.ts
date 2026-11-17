import type { Actor, World } from './types.ts';

export function mendActor(world: World, actor: Actor, amount: number): void {
  if (!actor.alive || amount <= 0) return;
  const before: number = actor.life;
  actor.life = Math.min(actor.maxLife, actor.life + amount);
  const gained: number = actor.life - before;
  if (gained > 0) world.events.push({ type: 'mend', actorId: actor.id, amount: gained });
}
