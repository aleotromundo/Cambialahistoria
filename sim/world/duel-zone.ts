import type { ZoneDef, ZoneDuel } from '../content/types.ts';
import { revive } from './death.ts';
import type { World } from './types.ts';
import { enterZone } from './zones.ts';

export function leaveDuel(world: World): void {
  const duel: ZoneDuel | null = world.zone.duel;
  if (duel === null) return;
  const home: ZoneDef | undefined = world.content.zones.get(duel.home.zone);
  if (home === undefined) return;
  const from: string = world.zone.id;
  if (!world.player.alive) {
    revive(world);
    world.events.push({ type: 'player_respawn' });
  }
  enterZone(world, home, { type: 'exit', exit: duel.home.exit }, true);
  world.events.push({ type: 'zone_changed', from, to: home.id });
}
