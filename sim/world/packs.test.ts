import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OUTPOST_CONTENT, OUTPOST_ZONE } from '../../test/road-support.ts';
import { must } from '../../test/support.ts';
import { UNRANKED_CONTENT } from '../../test/unranked-support.ts';
import { distance } from '../math.ts';
import { choicesOpen } from './death.ts';
import { objectiveTarget } from './objective.ts';
import type { ObjectiveTarget } from './objective.ts';
import type { Command, MomentState } from './types.ts';
import type { Content, MonsterDef, ZoneDef, ZonePack } from '../content/types.ts';
import { createWorld } from './create.ts';
import { waiting } from './packs.ts';
import type { PackTimer } from './pack-return.ts';
import { levelSpan } from './spawn.ts';
import { stepWorld } from './step.ts';
import type { MonsterState, World } from './types.ts';
import { enterZone } from './zones.ts';

const STEP = { dt: 0.05 } as const;
const SLEEPERS: ZonePack = { x: 12, z: 12, members: [{ monster: 'mended', count: 3, mods: [] }], when: [], level: 12, waits: { near: 8 } };
const CRIER: ZonePack = { x: 44, z: 12, members: [{ monster: 'crier', count: 1, mods: [] }], when: [], level: 7 };
const RULES = { after: 20, away: 10 } as const;
const DEN: ZoneDef = { ...OUTPOST_ZONE, id: 'den', surge: null, packReturn: RULES, packs: [SLEEPERS, CRIER] };

function crierDef(): MonsterDef {
  const base: MonsterDef = must(OUTPOST_CONTENT.monsters.get('mended'), 'mended');
  return { ...base, id: 'crier', alarm: { reach: 40, cry: 3 } };
}

function denWorld(): World {
  const content: Content = {
    ...OUTPOST_CONTENT,
    monsters: new Map<string, MonsterDef>([...OUTPOST_CONTENT.monsters, ['crier', crierDef()]]),
    zones: new Map<string, ZoneDef>([...OUTPOST_CONTENT.zones, [DEN.id, DEN]]),
  };
  const world: World = createWorld(content, { seed: 4, save: null });
  enterZone(world, DEN, { type: 'start' });
  world.player.invulnerable = 1e9;
  world.events = [];
  return world;
}

function packOf(world: World, pack: ZonePack): MonsterState[] {
  const ids: Set<number> = new Set<number>(world.packReturns.filter((timer: PackTimer): boolean => timer.pack === pack).map((timer: PackTimer): number => timer.packId));
  return world.monsters.filter((monster: MonsterState): boolean => monster.alive && ids.has(monster.packId));
}

function run(world: World, seconds: number): void {
  for (let elapsed: number = 0; elapsed < seconds; elapsed += STEP.dt) stepWorld(world, [], STEP.dt);
}

void test('a pack with a level of its own spawns at that level whatever the hero is', (): void => {
  const world: World = denWorld();
  const crier: MonsterState = must(packOf(world, CRIER)[0], 'crier');
  assert.equal(world.player.level, 1);
  assert.equal(crier.level, 7);
  assert.deepEqual(levelSpan(world), { least: 7, most: 12 });
});

void test('a waiting pack is not there until the hero comes near, then it rises already hunting him', (): void => {
  const world: World = denWorld();
  assert.equal(packOf(world, SLEEPERS).length, 0);
  assert.equal(waiting(world, SLEEPERS), true);
  world.player.pos = { x: SLEEPERS.x + 12, z: SLEEPERS.z + 6 };
  run(world, 1);
  assert.equal(packOf(world, SLEEPERS).length, 0);
  world.player.pos = { x: SLEEPERS.x + 6, z: SLEEPERS.z + 2 };
  run(world, STEP.dt);
  const risen: MonsterState[] = packOf(world, SLEEPERS);
  assert.equal(risen.length, 3);
  assert.ok(risen.every((monster: MonsterState): boolean => monster.aggro && monster.spawnTime > 0 && monster.level === 12));
});

void test('a crier that sees the hero runs to the nearest waiting pack and wakes it, far from the hero', (): void => {
  const world: World = denWorld();
  world.player.pos = { x: CRIER.x, z: CRIER.z + 6 };
  const crier: MonsterState = must(packOf(world, CRIER)[0], 'crier');
  let waited: number = 0;
  while (packOf(world, SLEEPERS).length === 0 && waited < 20) {
    run(world, STEP.dt);
    waited += STEP.dt;
  }
  assert.equal(packOf(world, SLEEPERS).length, 3);
  assert.ok(Math.hypot(crier.pos.x - SLEEPERS.x, crier.pos.z - SLEEPERS.z) <= 3.5, `crier at ${crier.pos.x}, ${crier.pos.z}`);
  assert.ok(Math.hypot(world.player.pos.x - SLEEPERS.x, world.player.pos.z - SLEEPERS.z) > 8);
});

void test('a crier cut down before it gets there wakes nobody', (): void => {
  const world: World = denWorld();
  world.player.pos = { x: CRIER.x, z: CRIER.z + 6 };
  run(world, 0.5);
  for (const monster of packOf(world, CRIER)) {
    monster.alive = false;
    monster.life = 0;
  }
  run(world, 20);
  assert.equal(packOf(world, SLEEPERS).length, 0);
  assert.equal(waiting(world, SLEEPERS), true);
});

void test('a woken pack that is cleared comes back asleep, and only wakes again when the hero comes near', (): void => {
  const world: World = denWorld();
  world.player.pos = { x: SLEEPERS.x + 6, z: SLEEPERS.z + 2 };
  run(world, STEP.dt);
  for (const monster of packOf(world, SLEEPERS)) {
    monster.alive = false;
    monster.life = 0;
  }
  world.player.pos = { x: 28, z: 37 };
  run(world, RULES.after + 2);
  assert.equal(packOf(world, SLEEPERS).length, 0);
  assert.equal(waiting(world, SLEEPERS), true);
  world.player.pos = { x: SLEEPERS.x + 6, z: SLEEPERS.z + 2 };
  run(world, STEP.dt);
  assert.equal(packOf(world, SLEEPERS).length, 3);
});

void test('a pack that names its rank always spawns at that rank, a rare one led by its leader, whatever the roll', (): void => {
  const named: ZonePack = { x: 30, z: 30, members: [{ monster: 'mended', count: 4, mods: [] }], when: [], level: 12, rank: 'rare' };
  const hall: ZoneDef = { ...OUTPOST_ZONE, id: 'ranked_hall', ranks: true, surge: null, packReturn: RULES, packs: [named] };
  const content: Content = { ...OUTPOST_CONTENT, zones: new Map<string, ZoneDef>([...OUTPOST_CONTENT.zones, [hall.id, hall]]) };
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const world: World = createWorld(content, { seed, save: null });
    enterZone(world, hall, { type: 'start' });
    const members: MonsterState[] = packOf(world, named);
    assert.equal(members.length, 4);
    assert.ok(members.every((monster: MonsterState): boolean => monster.def.rank?.id === 'rare'), `seed ${seed}`);
    assert.equal(members.filter((monster: MonsterState): boolean => monster.def.rank?.leader === true).length, 1, `seed ${seed}`);
  }
});

const FIRST_WALK = { seeds: 8, limit: 90, dt: 0.05, moveEvery: 5 } as const;

function echoFaction(world: World, monster: MonsterState): boolean {
  return monster.def.faction === world.content.moments.faction;
}

function roamers(world: World): MonsterState[] {
  return world.monsters.filter((monster: MonsterState): boolean => monster.alive && !echoFaction(world, monster));
}

function firstWalkCommands(world: World, tick: number): Command[] {
  const foe: MonsterState | undefined = world.monsters.filter((monster: MonsterState): boolean => monster.alive && monster.aggro && echoFaction(world, monster)).toSorted((a: MonsterState, b: MonsterState): number => distance(a.pos, world.player.pos) - distance(b.pos, world.player.pos))[0];
  if (foe !== undefined) return [{ type: 'skill', slot: 0, aim: foe.pos, targetId: foe.id }];
  if (choicesOpen(world)) return [{ type: 'respawn', choice: 'checkpoint' }];
  const target: ObjectiveTarget | null = objectiveTarget(world);
  return tick % FIRST_WALK.moveEvery === 0 && target !== null ? [{ type: 'move', held: false, dest: target.pos }] : [];
}

void test('a fresh hero walking the arrow from arrival to the first moment, dying there once, never comes within reach of a roaming pack until it is cleared', (): void => {
  const hall: ZoneDef = must(UNRANKED_CONTENT.zones.get('hall_of_time'), 'hall');
  for (let seed: number = 1; seed <= FIRST_WALK.seeds; seed += 1) {
    const world: World = createWorld(UNRANKED_CONTENT, { seed, save: null });
    enterZone(world, hall, { type: 'start' });
    world.player.invulnerable = Infinity;
    assert.ok(roamers(world).length > 0, `seed ${seed}: some packs stand in the Hall from the start`);
    let died: boolean = false;
    let exposed: boolean = false;
    let struck: boolean = false;
    let tick: number = 0;
    for (let elapsed: number = 0; elapsed < FIRST_WALK.limit && world.flags['first_moment'] !== 'cleared'; elapsed += FIRST_WALK.dt) {
      if (!exposed && world.moments.some((moment: MomentState): boolean => moment.phase === 'awake' && moment.entered)) {
        exposed = true;
        world.player.invulnerable = 0;
        world.player.life = 1;
        world.player.stats.lifeRegen = 0;
      }
      died = died || !world.player.alive;
      for (const event of stepWorld(world, firstWalkCommands(world, tick), FIRST_WALK.dt)) {
        if (event.type === 'moment_mark') struck = true;
        if (event.type === 'player_respawn') world.player.invulnerable = Infinity;
        const roused: MonsterState | undefined = event.type === 'aggro' ? world.monsters.find((monster: MonsterState): boolean => monster.id === event.monsterId) : undefined;
        if (roused !== undefined) assert.ok(echoFaction(world, roused), `seed ${seed}: ${roused.def.id} woke at ${elapsed.toFixed(1)} s`);
      }
      tick += 1;
      for (const roamer of roamers(world)) assert.ok(distance(roamer.pos, world.player.pos) > roamer.def.aggroRadius, `seed ${seed}: ${roamer.def.id} at ${roamer.pos.x.toFixed(1)},${roamer.pos.z.toFixed(1)} within reach of the hero at ${elapsed.toFixed(1)} s`);
    }
    assert.ok(struck && died, `seed ${seed}: the first moment struck and he died in it`);
    assert.equal(world.flags['first_moment'], 'cleared', `seed ${seed}`);
  }
});
