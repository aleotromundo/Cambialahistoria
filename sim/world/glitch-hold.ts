import type { Command, World } from './types.ts';

export function attacksHeld(world: World): boolean {
  const phase: string | null = world.scene?.phase ?? null;
  return world.time < world.glitch.holdUntil || phase === 'strike';
}

const WORLDLY: Readonly<Record<Command['type'], boolean>> = {
  read: true,
  use_item: true,
  enter_portal: true,
  hero: false,
  open: true,
  glitch: false,
  glitch_setting: false,
  overlay: false,
  strike: false,
  spawn: false,
  bench: false,
  move: false,
  walk: false,
  skill: true,
  hold: false,
  slot: false,
  steer: true,
  pickup: true,
  travel: true,
  talk: true,
  use: true,
  flask: true,
  teleport: true,
  trade: true,
  purse: false,
  stop: false,
  equip: false,
  unequip: false,
  drop: false,
  allocate: false,
  refund: false,
  respec: false,
  choose_change: false,
  advance: false,
  replay: false,
  respawn: false,
};

export function worldly(command: Command): boolean {
  return WORLDLY[command.type];
}

export function stillHero(world: World): void {
  const player = world.player;
  if (player.queued !== null && worldly(player.queued)) player.queued = null;
  if (player.intent.type === 'move') return;
  player.intent = { type: 'idle' };
  player.path = [];
}
