import type { SkillDef, ZoneExit } from '../content/types.ts';
import { DAMAGE_TYPES, SKILL_CATEGORIES } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { isWalkable } from '../nav/grid.ts';
import { playerMayStrike } from '../world/factions.ts';
import { blockedReason } from '../world/skills.ts';
import type { NpcState } from '../world/npc-types.ts';
import type { AreaState, FlaskState, GroundItem, HazardState, MonsterState, PlayerState, ProjectileState, World } from '../world/types.ts';
import type { EntityKind, Situation } from './contract.ts';
import { BEHAVIOUR_ORDER, FLASK_FEATURES, categoryIndex, damageIndex, DELIVERY_ORDER, ENTITY_KINDS, LAYOUT, MOVE_CHOICES, RL, SITUATIONS, SKILL_CHOICES } from './contract.ts';
import { skillNumbers } from './skill-numbers.ts';
import type { SkillNumbers } from './skill-numbers.ts';

export interface ObserveContext {
  readonly situation: Situation;
  readonly objective: Vec2 | null;
  readonly timeLeft: number;
  readonly progress: number;
}

export type Seen =
  | { readonly type: 'monster'; readonly pos: Vec2; readonly monster: MonsterState; readonly hostile: boolean }
  | { readonly type: 'projectile'; readonly pos: Vec2; readonly projectile: ProjectileState; readonly hostile: boolean }
  | { readonly type: 'hazard'; readonly pos: Vec2; readonly hazard: HazardState; readonly hostile: boolean }
  | { readonly type: 'area'; readonly pos: Vec2; readonly area: AreaState; readonly hostile: boolean }
  | { readonly type: 'loot'; readonly pos: Vec2; readonly ground: GroundItem }
  | { readonly type: 'exit'; readonly pos: Vec2; readonly exit: ZoneExit }
  | { readonly type: 'npc'; readonly pos: Vec2; readonly npc: NpcState }
  | { readonly type: 'objective'; readonly pos: Vec2 };

export interface View {
  readonly seen: readonly Seen[];
  readonly targets: readonly MonsterState[];
}

export interface Observation {
  readonly obs: Float32Array;
  readonly mask: Uint8Array;
  readonly view: View;
}

interface Writer {
  readonly out: Float32Array;
  at: number;
}

const ONE: number = 1;

function put(writer: Writer, value: number): void {
  const safe: number = Number.isFinite(value) ? Math.max(-RL.clip, Math.min(RL.clip, value)) : 0;
  writer.out[writer.at] = safe;
  writer.at += 1;
}

function flag(writer: Writer, on: boolean): void {
  put(writer, on ? ONE : 0);
}

function oneHot(writer: Writer, size: number, index: number): void {
  for (let at: number = 0; at < size; at += 1) flag(writer, at === index);
}

function blank(writer: Writer, count: number): void {
  for (let at: number = 0; at < count; at += 1) put(writer, 0);
}

function gap(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

export function hostileMonster(world: World, monster: MonsterState): boolean {
  return monster.alive && playerMayStrike(world, monster);
}

export function viewOf(world: World, objective: Vec2 | null): View {
  const player: PlayerState = world.player;
  const from: Vec2 = player.pos;
  const byGap = (a: Seen, b: Seen): number => gap(from, a.pos) - gap(from, b.pos);
  const monsters: MonsterState[] = world.monsters.filter((monster: MonsterState): boolean => monster.alive);
  const targets: MonsterState[] = monsters.filter((monster: MonsterState): boolean => hostileMonster(world, monster)).toSorted((a: MonsterState, b: MonsterState): number => gap(from, a.pos) - gap(from, b.pos)).slice(0, RL.targets);
  const first: Seen[] = targets.map((monster: MonsterState): Seen => ({ type: 'monster', pos: monster.pos, monster, hostile: true }));
  const rest: Seen[] = [
    ...monsters.filter((monster: MonsterState): boolean => !targets.includes(monster)).map((monster: MonsterState): Seen => ({ type: 'monster', pos: monster.pos, monster, hostile: hostileMonster(world, monster) })),
    ...world.projectiles.map((projectile: ProjectileState): Seen => ({ type: 'projectile', pos: projectile.pos, projectile, hostile: projectile.team !== 'player' })),
    ...world.hazards.map((hazard: HazardState): Seen => ({ type: 'hazard', pos: hazard.pos, hazard, hostile: hazard.team !== 'player' })),
    ...world.areas.map((area: AreaState): Seen => ({ type: 'area', pos: area.pos, area, hostile: area.ownerId !== player.id })),
    ...world.ground.map((ground: GroundItem): Seen => ({ type: 'loot', pos: ground.pos, ground })),
    ...world.zone.exits.map((exit: ZoneExit): Seen => ({ type: 'exit', pos: { x: exit.x, z: exit.z }, exit })),
    ...world.npcs.map((npc: NpcState): Seen => ({ type: 'npc', pos: npc.pos, npc })),
    ...(objective === null ? [] : [{ type: 'objective', pos: objective } satisfies Seen]),
  ].toSorted(byGap);
  return { seen: [...first, ...rest].slice(0, RL.entities), targets };
}

function writeFlask(writer: Writer, flask: FlaskState | undefined): void {
  if (flask === undefined) {
    blank(writer, FLASK_FEATURES.length);
    return;
  }
  flag(writer, true);
  put(writer, flask.charges / Math.max(1, flask.def.maxCharges));
  flag(writer, flask.charges >= flask.def.chargesPerUse && flask.cooldown <= 0);
  flag(writer, flask.def.resource === 'life');
  flag(writer, flask.def.resource === 'mana');
}

function writeSelf(writer: Writer, world: World, context: ObserveContext, view: View): void {
  const player: PlayerState = world.player;
  const phase: string | null = player.action?.phase ?? null;
  put(writer, player.life / Math.max(1, player.maxLife));
  put(writer, player.mana / Math.max(1, player.stats.maxMana));
  put(writer, player.maxLife / RL.lifeScale);
  put(writer, player.stats.maxMana / RL.manaScale);
  put(writer, player.level / RL.levelScale);
  put(writer, player.stats.moveSpeed / RL.speedScale);
  put(writer, player.stats.armour / RL.damageScale);
  put(writer, player.stats.critChance);
  put(writer, (player.stats.damageMin + player.stats.damageMax) / 2 / RL.damageScale);
  put(writer, player.stats.attackSpeed);
  flag(writer, player.action !== null);
  flag(writer, phase === 'windup');
  flag(writer, phase === 'channel');
  flag(writer, phase === 'recovery');
  put(writer, player.action?.timeLeft ?? 0);
  put(writer, player.stagger);
  put(writer, player.root);
  put(writer, player.invulnerable);
  flag(writer, player.moving);
  flag(writer, !player.alive);
  for (let slot: number = 0; slot < RL.flasks; slot += 1) writeFlask(writer, player.flasks[slot]);
  oneHot(writer, SITUATIONS.length, SITUATIONS.indexOf(context.situation));
  const objective: Vec2 | null = context.objective;
  flag(writer, objective !== null);
  put(writer, objective === null ? 0 : (objective.x - player.pos.x) / RL.distanceScale);
  put(writer, objective === null ? 0 : (objective.z - player.pos.z) / RL.distanceScale);
  put(writer, objective === null ? 0 : gap(player.pos, objective) / RL.distanceScale);
  put(writer, context.timeLeft / (RL.timeScale * RL.timeScale));
  const foes: readonly MonsterState[] = world.monsters.filter((monster: MonsterState): boolean => hostileMonster(world, monster));
  put(writer, foes.length / RL.countScale);
  put(writer, view.targets.filter((monster: MonsterState): boolean => gap(player.pos, monster.pos) <= RL.nearReach).length / RL.countScale);
  put(writer, context.progress);
  blank(writer, RL.spareSelf);
}

function writeSlot(writer: Writer, player: PlayerState, slot: number): void {
  const skill: SkillDef | null = player.skills[slot] ?? null;
  if (skill === null) {
    blank(writer, LAYOUT.slot);
    return;
  }
  const numbers: SkillNumbers = skillNumbers(skill);
  const left: number = player.cooldowns[skill.id] ?? 0;
  flag(writer, true);
  flag(writer, player.alive && blockedReason(player, skill) === null);
  put(writer, skill.cooldown > 0 ? left / skill.cooldown : 0);
  put(writer, skill.cooldown / RL.timeScale);
  put(writer, skill.manaCost / Math.max(1, player.stats.maxMana));
  flag(writer, player.mana >= skill.manaCost);
  put(writer, skill.windup);
  put(writer, skill.recovery);
  put(writer, numbers.reach / RL.distanceScale);
  put(writer, numbers.area / RL.areaScale);
  put(writer, skill.damage.weaponPercent / RL.damageScale);
  put(writer, (skill.damage.flatMin + skill.damage.flatMax) / 2 / RL.damageScale);
  put(writer, skill.knockback);
  put(writer, skill.stun);
  put(writer, skill.stagger);
  flag(writer, skill.press !== null);
  put(writer, numbers.duration / RL.timeScale);
  put(writer, numbers.count / RL.countScale);
  flag(writer, player.held.includes(slot));
  oneHot(writer, Object.keys(DELIVERY_ORDER).length, DELIVERY_ORDER[skill.delivery.type]);
  oneHot(writer, SKILL_CATEGORIES.length, categoryIndex(skill.category));
  oneHot(writer, DAMAGE_TYPES.length, damageIndex(skill.damage.type));
  blank(writer, RL.spareSlot);
}

interface EntityNumbers {
  readonly hostile: boolean;
  readonly life: number;
  readonly maxLife: number;
  readonly damage: number;
  readonly moveSpeed: number;
  readonly radius: number;
  readonly aggro: boolean;
  readonly acting: boolean;
  readonly windupLeft: number;
  readonly reach: number;
  readonly area: number;
  readonly boss: boolean;
  readonly rank: boolean;
  readonly stunned: boolean;
  readonly dir: Vec2;
  readonly speed: number;
  readonly timeLeft: number;
  readonly behaviour: number;
}

const QUIET: EntityNumbers = { hostile: false, life: 0, maxLife: 0, damage: 0, moveSpeed: 0, radius: 0, aggro: false, acting: false, windupLeft: 0, reach: 0, area: 0, boss: false, rank: false, stunned: false, dir: { x: 0, z: 0 }, speed: 0, timeLeft: 0, behaviour: -1 };

function monsterNumbers(world: World, monster: MonsterState, hostile: boolean): EntityNumbers {
  const player: PlayerState = world.player;
  const skill: SkillDef | undefined = monster.nextSkill ?? world.content.skills.get(monster.def.skill);
  const numbers: SkillNumbers = skill === undefined ? { reach: 0, area: 0, duration: 0, count: 0 } : skillNumbers(skill);
  const action = monster.action;
  return {
    hostile,
    life: monster.life / Math.max(1, monster.maxLife),
    maxLife: Math.log1p(monster.maxLife / Math.max(1, player.maxLife)),
    damage: (monster.damageMin + monster.damageMax) / 2 / Math.max(1, player.maxLife),
    moveSpeed: monster.def.moveSpeed / RL.speedScale,
    radius: monster.radius,
    aggro: monster.aggro,
    acting: action !== null,
    windupLeft: action !== null && action.phase === 'windup' ? action.timeLeft : 0,
    reach: numbers.reach / RL.distanceScale,
    area: numbers.area / RL.areaScale,
    boss: monster.def.boss !== null,
    rank: monster.def.rank !== null,
    stunned: monster.recovery.stunned > 0 || monster.stagger > 0,
    dir: { x: Math.cos(monster.facing), z: Math.sin(monster.facing) },
    speed: 0,
    timeLeft: 0,
    behaviour: BEHAVIOUR_ORDER[monster.def.behaviour.type],
  };
}

function entityNumbers(world: World, seen: Seen): EntityNumbers {
  const player: PlayerState = world.player;
  switch (seen.type) {
    case 'monster':
      return monsterNumbers(world, seen.monster, seen.hostile);
    case 'projectile': {
      const numbers: SkillNumbers = skillNumbers(seen.projectile.skill);
      return { ...QUIET, hostile: seen.hostile, damage: (seen.projectile.damageMin + seen.projectile.damageMax) / 2 / Math.max(1, player.maxLife), area: numbers.area / RL.areaScale, dir: seen.projectile.direction, speed: seen.projectile.skill.delivery.type === 'projectile' ? seen.projectile.skill.delivery.speed / RL.distanceScale : 0, timeLeft: seen.projectile.distanceLeft / RL.distanceScale };
    }
    case 'hazard':
      return { ...QUIET, hostile: seen.hostile, damage: (seen.hazard.damageMin + seen.hazard.damageMax) / 2 / Math.max(1, player.maxLife), area: seen.hazard.radius / RL.areaScale, radius: seen.hazard.radius, timeLeft: seen.hazard.timeLeft };
    case 'area': {
      const numbers: SkillNumbers = skillNumbers(seen.area.skill);
      return { ...QUIET, hostile: seen.hostile, damage: (seen.area.offence.damageMin + seen.area.offence.damageMax) / 2 / Math.max(1, player.maxLife), area: numbers.area / RL.areaScale, radius: numbers.area, timeLeft: seen.area.timeLeft };
    }
    case 'loot':
    case 'exit':
    case 'npc':
    case 'objective':
      return QUIET;
  }
  return QUIET;
}

function kindOf(seen: Seen): EntityKind {
  return seen.type;
}

function writeEntity(writer: Writer, world: World, seen: Seen | undefined): void {
  if (seen === undefined) {
    blank(writer, LAYOUT.entity);
    return;
  }
  const player: PlayerState = world.player;
  const numbers: EntityNumbers = entityNumbers(world, seen);
  flag(writer, true);
  oneHot(writer, ENTITY_KINDS.length, ENTITY_KINDS.indexOf(kindOf(seen)));
  flag(writer, numbers.hostile);
  put(writer, (seen.pos.x - player.pos.x) / RL.distanceScale);
  put(writer, (seen.pos.z - player.pos.z) / RL.distanceScale);
  put(writer, gap(player.pos, seen.pos) / RL.distanceScale);
  put(writer, numbers.life);
  put(writer, numbers.maxLife);
  put(writer, numbers.damage);
  put(writer, numbers.moveSpeed);
  put(writer, numbers.radius);
  flag(writer, numbers.aggro);
  flag(writer, numbers.acting);
  put(writer, numbers.windupLeft);
  put(writer, numbers.reach);
  put(writer, numbers.area);
  flag(writer, numbers.boss);
  flag(writer, numbers.rank);
  flag(writer, numbers.stunned);
  put(writer, numbers.dir.x);
  put(writer, numbers.dir.z);
  put(writer, numbers.speed);
  put(writer, numbers.timeLeft);
  oneHot(writer, Object.keys(BEHAVIOUR_ORDER).length, numbers.behaviour);
  blank(writer, RL.spareEntity);
}

function writeRays(writer: Writer, world: World): void {
  const from: Vec2 = world.player.pos;
  for (let ray: number = 0; ray < RL.rays; ray += 1) {
    const angle: number = (ray / RL.rays) * Math.PI * 2;
    let reach: number = 0;
    while (reach < RL.rayReach && isWalkable(world.grid, from.x + Math.cos(angle) * (reach + RL.rayStep), from.z + Math.sin(angle) * (reach + RL.rayStep))) reach += RL.rayStep;
    put(writer, reach / RL.rayReach);
  }
}

function flaskReady(flask: FlaskState | undefined): boolean {
  return flask !== undefined && flask.charges >= flask.def.chargesPerUse && flask.cooldown <= 0;
}

export function actionMask(world: World, view: View): Uint8Array {
  const mask: Uint8Array = new Uint8Array(LAYOUT.mask);
  const player: PlayerState = world.player;
  const alive: boolean = player.alive;
  let at: number = 0;
  for (let move: number = 0; move < MOVE_CHOICES; move += 1) mask[at + move] = move === 0 || alive ? 1 : 0;
  at += MOVE_CHOICES;
  for (let choice: number = 0; choice < SKILL_CHOICES; choice += 1) {
    const skill: SkillDef | null = choice === 0 ? null : (player.skills[choice - 1] ?? null);
    mask[at + choice] = choice === 0 || (alive && skill !== null && blockedReason(player, skill) === null) ? 1 : 0;
  }
  at += SKILL_CHOICES;
  for (let target: number = 0; target < RL.targets; target += 1) mask[at + target] = target === 0 || target < view.targets.length ? 1 : 0;
  at += RL.targets;
  for (let choice: number = 0; choice <= RL.flasks; choice += 1) mask[at + choice] = choice === 0 || (alive && flaskReady(player.flasks[choice - 1])) ? 1 : 0;
  return mask;
}

export function observe(world: World, context: ObserveContext): Observation {
  const view: View = viewOf(world, context.objective);
  const writer: Writer = { out: new Float32Array(LAYOUT.size), at: 0 };
  writeSelf(writer, world, context, view);
  for (let slot: number = 0; slot < RL.slots; slot += 1) writeSlot(writer, world.player, slot);
  for (let index: number = 0; index < RL.entities; index += 1) writeEntity(writer, world, view.seen[index]);
  writeRays(writer, world);
  if (writer.at !== LAYOUT.size) throw new Error(`observation wrote ${writer.at} of ${LAYOUT.size} numbers`);
  return { obs: writer.out, mask: actionMask(world, view), view };
}
