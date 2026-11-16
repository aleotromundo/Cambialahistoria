import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arena, ARENA_CENTRE, place } from '../../test/arena-support.ts';
import { finishQuests, must, worldIn, zoneOf } from '../../test/support.ts';
import type { GlitchDef, GlitchKind, GlitchRules } from '../content/glitches.ts';
import { loadContent } from '../content/content.ts';
import { loadGlitches } from '../content/glitches.ts';
import type { Content, ZoneExit } from '../content/types.ts';
import { distance } from '../math.ts';
import { readSave, toSave } from '../save.ts';
import { createWorld } from './create.ts';
import { glitchBlock, inMist, requestGlitch, setGlitchesEnabled, stageOf, stepGlitch, storyProgress } from './glitch.ts';
import { forceStrike } from './moments.ts';
import { dropOnGround } from './ground.ts';
import type { ServiceKind } from '../content/trade-types.ts';
import { attacksHeld } from './glitch-hold.ts';
import type { GlitchRequest } from './glitch-types.ts';
import type { SeamPhase } from './seam.ts';
import { stepWorld } from './step.ts';
import type { MomentState, MonsterState, World, WorldEvent } from './types.ts';
import { acceptsCommand } from './wake.ts';
import { travelThrough } from './zones.ts';

const content: Content = loadContent();
const DT: number = 1 / 30;
const SERVICE: ServiceKind = 'vendor';
const MINUTES: number = 20;

type EventOf<T extends WorldEvent['type']> = Extract<WorldEvent, { readonly type: T }>;

function ofType<T extends WorldEvent['type']>(events: readonly WorldEvent[], type: T): EventOf<T>[] {
  return events.filter((event: WorldEvent): event is EventOf<T> => event.type === type);
}

function run(world: World, seconds: number): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let step: number = 0; step < Math.round(seconds / DT); step += 1) events.push(...stepWorld(world, [], DT));
  return events;
}

function combat(kind: GlitchKind): GlitchRequest {
  return { kind, source: 'combat', trigger: null };
}

function fight(seed: number): { readonly world: World; readonly thrall: MonsterState } {
  const world: World = arena(seed);
  const thrall: MonsterState = place(world, 'mended', { x: ARENA_CENTRE.x + 1.4, z: ARENA_CENTRE.z });
  return { world, thrall };
}

function keepFighting(world: World): void {
  for (const monster of world.monsters) {
    monster.alive = true;
    monster.aggro = true;
  }
}

function glitchOnly(world: World, seconds: number, tick: number, between: (world: World) => void = (): void => undefined): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let step: number = 0; step < Math.round(seconds / tick); step += 1) {
    between(world);
    world.events = [];
    world.time += tick;
    stepGlitch(world, tick);
    events.push(...world.events);
  }
  return events;
}

function harmlessFight(seed: number, progress: number): World {
  const { world, thrall } = fight(seed);
  thrall.pos = { x: ARENA_CENTRE.x + 6, z: ARENA_CENTRE.z };
  world.glitch.progress = progress;
  world.glitch.played = world.glitch.def.rules.newCharacter;
  return world;
}

function untilPhase(world: World, phase: SeamPhase): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let step: number = 0; step < 600 && world.glitch.active?.phase !== phase; step += 1) events.push(...stepWorld(world, [], DT));
  assert.equal(world.glitch.active?.phase, phase);
  return events;
}

void test('a seam may come mid-fight, but a quiet pass never hides a fight', (): void => {
  const { world } = fight(1);
  world.glitch.played = world.glitch.def.rules.newCharacter;
  assert.equal(glitchBlock(world, { kind: 'hard_cut', source: 'debug', trigger: null }), null);
  assert.equal(glitchBlock(world, combat('quiet_pass')), 'fight');
  assert.equal(glitchBlock(world, { kind: 'quiet_pass', source: 'zone', trigger: null }), 'fight');
  assert.equal(glitchBlock(world, combat('stutter')), null);
  requestGlitch(world, 'hard_cut', 'debug');
  assert.equal(ofType(run(world, DT * 2), 'glitch_start')[0]?.kind, 'hard_cut');
});

void test('the seconds after a blow still count as a fight for a quiet pass', (): void => {
  const world: World = harmlessFight(11, 4);
  world.monsters = [];
  world.time = world.glitch.def.rules.arrival + 1;
  world.events = [{ type: 'damage', targetId: world.player.id, sourceId: 0, targetTeam: 'player', amount: 1, crit: false, killed: false, pos: world.player.pos, direction: { x: 1, z: 0 }, skill: must(content.skills.get('cleave'), 'cleave'), burn: false }];
  stepGlitch(world, 0);
  assert.equal(glitchBlock(world, { kind: 'quiet_pass', source: 'story', trigger: null }), 'fight');
  assert.equal(glitchBlock(world, { kind: 'hard_cut', source: 'story', trigger: null }), null);
  world.time += world.glitch.def.rules.fightQuiet + 0.1;
  assert.equal(glitchBlock(world, { kind: 'quiet_pass', source: 'story', trigger: null }), null);
});

void test('a seam waits out the first minute in a zone and never comes soon after another', (): void => {
  const world: World = harmlessFight(12, 4);
  world.monsters = [];
  const rules: GlitchRules = world.glitch.def.rules;
  const story: GlitchRequest = { kind: 'hard_cut', source: 'story', trigger: null };
  const zone: GlitchRequest = { kind: 'hard_cut', source: 'zone', trigger: null };
  assert.equal(glitchBlock(world, story), 'arrival');
  assert.equal(glitchBlock(world, zone), 'arrival');
  world.time = rules.arrival + 1;
  assert.equal(glitchBlock(world, story), null);
  requestGlitch(world, 'hard_cut', 'story');
  const start: EventOf<'glitch_start'> = must(ofType(glitchOnly(world, DT, DT), 'glitch_start')[0], 'hard cut');
  glitchOnly(world, start.duration + 1, DT);
  assert.equal(world.glitch.active, null);
  world.time = world.glitch.readyAt;
  assert.equal(glitchBlock(world, story), 'spacing');
  assert.equal(glitchBlock(world, zone), 'spacing');
  assert.equal(glitchBlock(world, { kind: 'hard_cut', source: 'debug', trigger: null }), null);
  world.time = world.glitch.lastMist + rules.gap;
  assert.equal(glitchBlock(world, story), null);
});

void test('every phase of a seam runs in order with its length from data', (): void => {
  const world: World = harmlessFight(16, 1);
  world.monsters = [];
  const times = world.glitch.def.seam;
  const stage = stageOf(world.glitch.def, 1);
  requestGlitch(world, 'hard_cut', 'debug');
  const events: WorldEvent[] = [];
  const at: Partial<Record<SeamPhase, number>> = {};
  for (let step: number = 0; step < 400; step += 1) {
    const stepped: WorldEvent[] = stepWorld(world, [], DT);
    for (const event of ofType(stepped, 'glitch_phase')) at[event.phase] = world.time;
    events.push(...stepped);
    if (ofType(stepped, 'glitch_end').length > 0) break;
  }
  assert.deepEqual(ofType(events, 'glitch_phase').map((event): SeamPhase => event.phase), ['build_up', 'tear', 'mist', 'tear_back', 'settle']);
  const start: EventOf<'glitch_start'> = must(ofType(events, 'glitch_start')[0], 'seam');
  const gap = (from: SeamPhase, to: SeamPhase): number => (at[to] ?? 0) - (at[from] ?? 0);
  assert.ok(Math.abs(gap('build_up', 'tear') - times.buildUp) <= DT + 1e-9);
  assert.ok(Math.abs(gap('tear', 'mist') - times.tear) <= DT + 1e-9);
  assert.ok(Math.abs(gap('mist', 'tear_back') - (start.duration - times.buildUp - times.tear - times.tearBack - times.settle)) <= DT + 1e-9);
  assert.ok(gap('mist', 'tear_back') >= stage.mist.min - DT && gap('mist', 'tear_back') <= stage.mist.max + DT);
  assert.ok(Math.abs(gap('tear_back', 'settle') - times.tearBack) <= DT + 1e-9);
  assert.equal(ofType(events, 'glitch_end')[0]?.calledOff, false);
  assert.equal(ofType(events, 'silence').length, 1);
});

void test('no hard cut or quiet pass plays under an open overlay, nor for a few seconds after it closes', (): void => {
  const world: World = harmlessFight(14, 4);
  world.monsters = [];
  world.time = world.glitch.def.rules.arrival + 1;
  const story: GlitchRequest = { kind: 'hard_cut', source: 'story', trigger: null };
  const pass: GlitchRequest = { kind: 'quiet_pass', source: 'zone', trigger: null };
  stepWorld(world, [{ type: 'overlay', open: true }], DT);
  assert.equal(glitchBlock(world, story), 'overlay');
  assert.equal(glitchBlock(world, pass), 'overlay');
  assert.equal(glitchBlock(world, { kind: 'hard_cut', source: 'debug', trigger: null }), 'overlay');
  assert.equal(glitchBlock(world, combat('stutter')), null);
  requestGlitch(world, 'hard_cut', 'story');
  assert.equal(ofType(run(world, 2), 'glitch_start').length, 0);
  stepWorld(world, [{ type: 'overlay', open: false }], DT);
  assert.equal(glitchBlock(world, story), 'overlay');
  const quiet: number = world.glitch.overlayShut + world.glitch.def.rules.overlayQuiet;
  run(world, quiet - world.time - 0.2);
  assert.equal(world.glitch.active, null);
  const start: EventOf<'glitch_start'> = must(ofType(run(world, 0.4), 'glitch_start')[0], 'the waiting hard cut');
  assert.equal(start.kind, 'hard_cut');
});

void test('a panel opened in the build-up calls the seam off, and one opened in the mist ends it', (): void => {
  const world: World = harmlessFight(15, 4);
  world.monsters = [];
  world.time = world.glitch.def.rules.arrival + 1;
  requestGlitch(world, 'hard_cut', 'story');
  const start: EventOf<'glitch_start'> = must(ofType(run(world, DT * 2), 'glitch_start')[0], 'hard cut');
  assert.equal(start.kind, 'hard_cut');
  const early: WorldEvent[] = stepWorld(world, [{ type: 'overlay', open: true }], DT);
  assert.equal(world.glitch.active, null);
  assert.equal(ofType(early, 'glitch_end')[0]?.calledOff, true);
  assert.equal(ofType(early, 'silence').length, 0);
  stepWorld(world, [{ type: 'overlay', open: false }], DT);
  requestGlitch(world, 'hard_cut', 'debug');
  run(world, world.glitch.def.rules.overlayQuiet);
  untilPhase(world, 'mist');
  const events: WorldEvent[] = stepWorld(world, [{ type: 'overlay', open: true }], DT);
  assert.equal(world.glitch.active, null);
  assert.equal(ofType(events, 'glitch_end')[0]?.calledOff, false);
  assert.equal(acceptsCommand({ ...world, wake: { elapsed: 0, rate: 1, plan: { still: 1, stir: 1, rise: 1, front: 0.5, settle: 1, hurry: 1 } } }, { type: 'overlay', open: false }), true);
});

void test('a hard cut waits while a moment fight is awake or a skill choice is open', (): void => {
  const world: World = harmlessFight(13, 4);
  const thrall: MonsterState = must(world.monsters[0], 'thrall');
  thrall.aggro = false;
  thrall.pos = { x: ARENA_CENTRE.x + 40, z: ARENA_CENTRE.z };
  world.time = world.glitch.def.rules.arrival + 1;
  const story: GlitchRequest = { kind: 'quiet_pass', source: 'story', trigger: null };
  assert.equal(glitchBlock(world, story), null);
  const def = must([...content.moments.defs.values()][0], 'a moment');
  const moment: MomentState = must(forceStrike(world, thrall.pos, def.id), 'moment');
  moment.phase = 'awake';
  moment.figures.splice(0, moment.figures.length, { echo: 0, pos: thrall.pos, facing: 0, turned: true, monsterId: thrall.id });
  assert.equal(glitchBlock(world, story), 'fight');
  world.moments = [];
});

void test('monster attacks wait out the glitch and its grace, then resume', (): void => {
  const { world, thrall } = fight(2);
  requestGlitch(world, 'stutter', 'debug');
  const first: WorldEvent[] = stepWorld(world, [], DT);
  assert.equal(ofType(first, 'glitch_start')[0]?.kind, 'stutter');
  const held: number = world.glitch.def.stutter + world.glitch.def.rules.grace;
  const during: WorldEvent[] = run(world, held - DT * 2);
  assert.equal(ofType(during, 'skill_start').filter((event): boolean => event.actorId === thrall.id).length, 0);
  assert.equal(attacksHeld(world), true);
  const after: WorldEvent[] = run(world, 3);
  assert.equal(attacksHeld(world), false);
  assert.ok(ofType(after, 'skill_start').some((event): boolean => event.actorId === thrall.id));
});

void test('a glitch waits while the hero is below the life threshold or a lethal blow is winding up', (): void => {
  const { world, thrall } = fight(3);
  world.player.life = world.player.maxLife * world.glitch.def.rules.minLifeFraction * 0.9;
  assert.equal(glitchBlock(world, combat('hard_cut')), 'low_life');
  world.player.life = world.player.maxLife;
  for (let step: number = 0; step < 200 && thrall.action?.phase !== 'windup'; step += 1) stepWorld(world, [], DT);
  assert.equal(thrall.action?.phase, 'windup');
  assert.equal(glitchBlock(world, combat('stutter')), null);
  world.player.life = thrall.damageMax;
  assert.equal(glitchBlock(world, combat('hard_cut')), 'telegraph');
  requestGlitch(world, 'hard_cut', 'debug');
  assert.equal(ofType(stepWorld(world, [], 0), 'glitch_start').length, 0);
  assert.equal(world.glitch.requests.length, 1);
});

void test('a boss winding up any blow holds every glitch back, even at full life', (): void => {
  const boss: string = must([...content.monsters.values()].find((def): boolean => def.boss !== null), 'a boss').id;
  const world: World = arena(4);
  const monster: MonsterState = place(world, boss, { x: ARENA_CENTRE.x + 1.6, z: ARENA_CENTRE.z });
  world.player.invulnerable = 60;
  for (let step: number = 0; step < 600 && monster.action?.phase !== 'windup'; step += 1) stepWorld(world, [], DT);
  assert.equal(monster.action?.phase, 'windup');
  world.player.life = world.player.maxLife;
  assert.equal(glitchBlock(world, combat('stutter')), 'telegraph');
});

void test('two glitches never come within the cooldown, but a debug request may', (): void => {
  const world: World = harmlessFight(5, 0);
  world.glitch.requests.push(combat('stutter'));
  glitchOnly(world, world.glitch.def.stutter + DT * 3, DT);
  assert.equal(world.glitch.active, null);
  assert.equal(glitchBlock(world, combat('stutter')), 'cooldown');
  assert.equal(glitchBlock(world, { kind: 'stutter', source: 'debug', trigger: null }), null);
  assert.equal(glitchBlock(world, { kind: 'quiet_pass', source: 'zone', trigger: null }), 'cooldown');
  world.time = world.glitch.readyAt;
  assert.equal(glitchBlock(world, combat('stutter')), null);
});

void test('silhouettes stand where the hero once stood in this zone when those spots are in sight', (): void => {
  const world: World = finishQuests(world0());
  stepWorld(world, [], DT);
  const hero = world.player.pos;
  const near: number = world.glitch.def.silhouettes.near + 1;
  for (let index: number = 0; index < 20; index += 1) world.path.entries.push({ t: index, zone: world.zone.id, x: hero.x + near, z: hero.z + index * 0.1, act: 'step' });
  world.path.clock = 500;
  world.glitch.progress = 4;
  world.glitch.requests.push({ kind: 'quiet_pass', source: 'zone', trigger: null });
  world.events = [];
  stepGlitch(world, 0);
  const start: EventOf<'glitch_start'> = must(ofType(world.events, 'glitch_start')[0], 'quiet pass');
  assert.ok(start.silhouettes.length > 0);
  for (const shade of start.silhouettes) assert.ok(world.path.entries.some((entry): boolean => entry.x === shade.x && entry.z === shade.z));
});

void test('a seam with nothing else to change still names its one edit, the hero turned, and only once the world is hidden', (): void => {
  const world: World = harmlessFight(14, 1);
  world.monsters = [];
  world.zone = { ...world.zone, props: [] };
  requestGlitch(world, 'hard_cut', 'debug');
  const start: EventOf<'glitch_start'> = must(ofType(stepWorld(world, [], DT), 'glitch_start')[0], 'hard cut');
  assert.equal(start.edit, null);
  const phases: EventOf<'glitch_phase'>[] = ofType(untilPhase(world, 'tear_back'), 'glitch_phase');
  assert.equal(phases.find((event): boolean => event.phase === 'mist')?.edit, 'hero_turn');
});

void test('the glitch setting reaches the world as a command', (): void => {
  const world: World = harmlessFight(15, 0);
  stepWorld(world, [{ type: 'glitch_setting', enabled: false }], DT);
  assert.equal(world.glitch.enabled, false);
  stepWorld(world, [{ type: 'glitch_setting', enabled: true }], DT);
  assert.equal(world.glitch.enabled, true);
});

void test('a quiet pass starts the cooldown like any other glitch', (): void => {
  const world: World = harmlessFight(5, 4);
  world.monsters = [];
  world.glitch.requests.push({ kind: 'quiet_pass', source: 'zone', trigger: null });
  glitchOnly(world, world.glitch.def.quietPass + DT * 3, DT);
  assert.equal(world.glitch.active, null);
  assert.equal(glitchBlock(world, combat('stutter')), 'cooldown');
});

void test('the debug command asks for a glitch through the world step', (): void => {
  const world: World = harmlessFight(13, 0);
  const events: WorldEvent[] = stepWorld(world, [{ type: 'glitch', kind: 'stutter' }], DT);
  assert.equal(ofType(events, 'glitch_start')[0]?.kind, 'stutter');
});

void test('the story decides how often glitches come and which kinds, and the same seed gives the same glitches', (): void => {
  const early: WorldEvent[] = ofType(glitchOnly(harmlessFight(6, 0), MINUTES * 60, 0.25, keepFighting), 'glitch_start');
  const late: WorldEvent[] = ofType(glitchOnly(harmlessFight(6, 4), MINUTES * 60, 0.25, keepFighting), 'glitch_start');
  const again: WorldEvent[] = ofType(glitchOnly(harmlessFight(6, 4), MINUTES * 60, 0.25, keepFighting), 'glitch_start');
  assert.ok(early.length > 0, `early ${early.length} late ${late.length}`);
  assert.ok(late.length > early.length, `early ${early.length} late ${late.length}`);
  assert.deepEqual(again, late);
  assert.equal(ofType(late, 'glitch_start').some((event): boolean => event.kind === 'quiet_pass'), false);
  assert.equal(ofType(early, 'glitch_start').some((event): boolean => event.kind === 'hard_cut'), false);
});

void test('mid-fight seams are rolled from the stage, and never come closer than the gap', (): void => {
  const world: World = harmlessFight(17, 4);
  const starts: number[] = [];
  glitchOnly(world, MINUTES * 60, 0.25, (current: World): void => {
    keepFighting(current);
    if (current.events.some((event: WorldEvent): boolean => event.type === 'glitch_start' && event.kind === 'hard_cut')) starts.push(current.time);
  });
  assert.ok(starts.length >= 2, `seams ${starts.length}`);
  for (let index: number = 1; index < starts.length; index += 1) assert.ok((starts[index] ?? 0) - (starts[index - 1] ?? 0) >= world.glitch.def.rules.gap);
});

function world0(): World {
  return createWorld(content, { seed: 1, save: null });
}

const done = (quest: string): { readonly type: 'quest'; readonly quest: string; readonly is: 'done'; readonly not: false } => ({ type: 'quest', quest, is: 'done', not: false });
const STAGED: GlitchDef = {
  ...loadGlitches(),
  progress: [
    { value: 1, when: [done('out_of_the_mist')] },
    { value: 2, when: [done('to_the_waystation')] },
    { value: 4, when: [done('out_of_the_mist'), done('to_the_waystation')] },
  ],
};

function lateWorld(seed: number, save: ReturnType<typeof readSave> = null): World {
  return createWorld(content, { seed, save, glitches: STAGED });
}

void test('story progress comes from quests, never falls, and travels in the save', (): void => {
  const partial: World = lateWorld(1);
  partial.quests = { out_of_the_mist: must(content.quests.get('out_of_the_mist'), 'quest').objectives.length };
  assert.equal(storyProgress(partial), 1);
  partial.quests = { to_the_waystation: must(content.quests.get('to_the_waystation'), 'quest').objectives.length };
  assert.equal(storyProgress(partial), 2);
  const world: World = finishQuests(lateWorld(1));
  assert.equal(storyProgress(world), 4);
  stepWorld(world, [], DT);
  assert.equal(world.glitch.progress, 4);
  world.quests = {};
  assert.equal(storyProgress(world), 4);
  const loaded: World = lateWorld(2, readSave(content, JSON.parse(JSON.stringify(toSave(world)))));
  assert.equal(loaded.glitch.progress, 4);
  const plain: World = finishQuests(world0());
  assert.equal(storyProgress(plain), 1);
});

void test('a story trigger waits for its moment, fires once, and stays fired after a save', (): void => {
  const world: World = harmlessFight(7, 0);
  world.quests = { to_the_waystation: must(content.quests.get('to_the_waystation'), 'quest').objectives.length };
  for (const monster of world.monsters) monster.aggro = true;
  assert.equal(ofType(glitchOnly(world, 2, DT), 'glitch_start').length, 0);
  for (const monster of world.monsters) monster.aggro = false;
  world.time = world.glitch.def.rules.arrival + 1;
  const fired: EventOf<'glitch_start'>[] = ofType(glitchOnly(world, DT, DT), 'glitch_start');
  assert.equal(fired[0]?.kind, 'hard_cut');
  assert.deepEqual(world.glitch.fired, ['first_seam']);
  const loaded: World = createWorld(content, { seed: 8, save: readSave(content, JSON.parse(JSON.stringify(toSave(world)))) });
  assert.deepEqual(loaded.glitch.fired, ['first_seam']);
  glitchOnly(world, 120, 1);
  assert.equal(world.glitch.requests.some((request: GlitchRequest): boolean => request.trigger === 'first_seam'), false);
});

void test('late in the story every zone change passes through the mist, with silhouettes from the hero’s own path', (): void => {
  const world: World = finishQuests(lateWorld(1));
  stepWorld(world, [], DT);
  for (let index: number = 0; index < 30; index += 1) world.path.entries.push({ t: index, zone: world.zone.id, x: 10 + index, z: 30, act: 'step' });
  world.path.clock = 500;
  const exit: ZoneExit = must(world.zone.exits.find((entry: ZoneExit): boolean => content.zones.get(entry.to)?.kind === 'wild'), 'an exit into the wild');
  world.events = [];
  travelThrough(world, exit);
  stepGlitch(world, 0);
  const start: EventOf<'glitch_start'> = must(ofType(world.events, 'glitch_start')[0], 'quiet pass');
  assert.equal(start.kind, 'quiet_pass');
  assert.equal(start.duration, world.glitch.def.quietPass);
  assert.equal(start.silhouettes.length, stageOf(world.glitch.def, 4).silhouettes);
  for (const shade of start.silhouettes) {
    const gap: number = distance(shade, world.player.pos);
    assert.ok(gap >= world.glitch.def.silhouettes.near - 1e-6 && gap <= world.glitch.def.silhouettes.far + 1e-6);
  }
  assert.equal(ofType(world.events, 'silence')[0]?.duration, start.duration);
});

void test('early in the story a zone change stays clear of the mist', (): void => {
  const world: World = world0();
  const exit: ZoneExit = must(world.zone.exits[0], 'an exit');
  world.events = [];
  travelThrough(world, exit);
  stepGlitch(world, 0);
  assert.equal(ofType(world.events, 'glitch_start').length, 0);
});

void test('the hero faces the other way only as the tear back begins, while the world is still hidden', (): void => {
  const { world } = fight(10);
  world.monsters = [];
  world.glitch.progress = 0;
  const facing: number = world.player.facing;
  requestGlitch(world, 'hard_cut', 'debug');
  untilPhase(world, 'mist');
  assert.equal(world.glitch.active?.edit, 'hero_turn');
  assert.equal(world.player.facing, facing);
  untilPhase(world, 'tear_back');
  assert.equal(inMist(world), true);
  assert.ok(Math.abs(Math.cos(world.player.facing - facing) + 1) < 1e-9);
});

void test('turned off, nothing fires on its own, but a debug request still does', (): void => {
  const world: World = harmlessFight(11, 4);
  setGlitchesEnabled(world, false);
  assert.equal(ofType(glitchOnly(world, 600, 1), 'glitch_start').length, 0);
  requestGlitch(world, 'stutter', 'debug');
  assert.equal(ofType(glitchOnly(world, DT, DT), 'glitch_start').length, 1);
});

void test('a wrong word arms the next line instead of taking the hero anywhere', (): void => {
  const world: World = harmlessFight(12, 0);
  requestGlitch(world, 'wrong_word', 'debug');
  const events: WorldEvent[] = glitchOnly(world, DT, DT);
  assert.equal(ofType(events, 'glitch_start')[0]?.kind, 'wrong_word');
  assert.notEqual(world.glitch.wrongWord, null);
  assert.equal(world.glitch.active, null);
  assert.equal(ofType(events, 'silence').length, 0);
});

void test('no seam or quiet pass ever plays in the Hideout or the In-Between, even when asked for directly', (): void => {
  const town: World = worldIn(content, content.world.town, 21);
  town.glitch.played = town.glitch.def.rules.newCharacter;
  town.time = town.glitch.def.rules.arrival + 1;
  for (const source of ['debug', 'story', 'combat', 'zone'] as const) {
    assert.equal(glitchBlock(town, { kind: 'hard_cut', source, trigger: null }), 'zone');
    assert.equal(glitchBlock(town, { kind: 'quiet_pass', source, trigger: null }), 'zone');
  }
  const late: World = finishQuests(lateWorld(22));
  late.glitch.played = late.glitch.def.rules.newCharacter;
  const home: ZoneExit = must(late.zone.exits.find((entry: ZoneExit): boolean => entry.to === content.world.town), 'the way to the Hideout');
  late.events = [];
  travelThrough(late, home);
  stepGlitch(late, 0);
  assert.equal(ofType(late.events, 'glitch_start').length, 0);
  const mist: World = worldIn(content, must(content.world.opening, 'the opening zone'), 23);
  assert.equal(glitchBlock(mist, { kind: 'hard_cut', source: 'debug', trigger: null }), 'zone');
});

void test('no seam during a boss fight, a scripted scene, an escort, a conversation or a service', (): void => {
  const boss: string = must([...content.monsters.values()].find((def): boolean => def.boss !== null), 'a boss').id;
  const request: GlitchRequest = { kind: 'hard_cut', source: 'debug', trigger: null };
  const world: World = harmlessFight(24, 4);
  world.monsters = [];
  const giant: MonsterState = place(world, boss, { x: ARENA_CENTRE.x + 12, z: ARENA_CENTRE.z });
  giant.aggro = true;
  assert.equal(glitchBlock(world, request), 'boss');
  giant.aggro = false;
  assert.equal(glitchBlock(world, request), null);
  world.monsters = [];
  const meeting = must(zoneOf(content, 'hall_of_time').scenes[0], 'the Warden meeting');
  world.scene = { def: meeting, phase: 'bring', momentId: null, elapsed: 0, missed: 0, wardId: null, npcId: null, placement: null };
  assert.equal(glitchBlock(world, request), 'scene');
  world.scene = null;
  world.escort = { npc: 'warden_guide', pace: 1 };
  assert.equal(glitchBlock(world, request), 'scene');
  world.escort = null;
  world.service = { kind: SERVICE, owner: 'trader', anchor: world.player.pos };
  assert.equal(glitchBlock(world, request), 'busy');
  world.service = null;
  assert.equal(glitchBlock(world, request), null);
});

void test('a new character meets no seam in its first minutes of play, and the minutes travel in the save', (): void => {
  const world: World = harmlessFight(25, 4);
  world.monsters = [];
  world.glitch.played = 0;
  world.time = world.glitch.def.rules.arrival + 1;
  const story: GlitchRequest = { kind: 'hard_cut', source: 'story', trigger: null };
  assert.equal(glitchBlock(world, story), 'new');
  assert.equal(glitchBlock(world, { kind: 'hard_cut', source: 'debug', trigger: null }), null);
  glitchOnly(world, world.glitch.def.rules.newCharacter / 2, 1);
  const loaded: World = createWorld(content, { seed: 26, save: readSave(content, JSON.parse(JSON.stringify(toSave(world)))) });
  assert.ok(Math.abs(loaded.glitch.played - world.glitch.def.rules.newCharacter / 2) < 1e-6);
  glitchOnly(world, world.glitch.def.rules.newCharacter / 2, 1);
  assert.equal(glitchBlock(world, story), null);
  assert.equal(createWorld(content, { seed: 27, save: null }).glitch.played, 0);
});

void test('the play clock reaches the save only in whole steps, each asking for a save, and stops at the newcomer line', (): void => {
  const world: World = harmlessFight(28, 4);
  world.monsters = [];
  world.glitch.played = 0;
  world.glitch.banked = 0;
  const rules: GlitchRules = world.glitch.def.rules;
  let asks: number = 0;
  let changes: number = 0;
  let saved: string = JSON.stringify(toSave(world).glitch);
  for (let step: number = 0; step < (rules.newCharacter + rules.clockStep * 4) * 10; step += 1) {
    world.events = [];
    stepGlitch(world, 0.1);
    const asked: boolean = world.events.some((event: WorldEvent): boolean => event.type === 'glitch_clock');
    const now: string = JSON.stringify(toSave(world).glitch);
    if (asked) asks += 1;
    if (now !== saved) {
      changes += 1;
      assert.ok(asked, `the save changed at step ${step} without asking`);
    }
    saved = now;
  }
  assert.equal(asks, changes);
  assert.ok(asks <= Math.ceil(rules.newCharacter / rules.clockStep) + 1);
  assert.equal(toSave(world).glitch.played, rules.newCharacter);
});

void test('the seam is called off in the build-up when the hero dies, talks, or leaves the zone', (): void => {
  const cases: readonly ((world: World) => void)[] = [
    (world: World): void => {
      world.player.alive = false;
    },
    (world: World): void => {
      world.service = { kind: SERVICE, owner: 'trader', anchor: world.player.pos };
    },
    (world: World): void => {
      world.events.push({ type: 'zone_changed', from: world.zone.id, to: world.zone.id });
    },
  ];
  cases.forEach((interrupt: (world: World) => void, index: number): void => {
    const world: World = harmlessFight(30 + index, 4);
    world.monsters = [];
    requestGlitch(world, 'hard_cut', 'debug');
    glitchOnly(world, DT * 3, DT);
    assert.equal(world.glitch.active?.phase, 'build_up');
    world.events = [];
    interrupt(world);
    world.time += DT;
    stepGlitch(world, DT);
    const events: WorldEvent[] = world.events;
    assert.equal(world.glitch.active, null);
    assert.equal(ofType(events, 'glitch_end')[0]?.calledOff, true);
    assert.equal(ofType(events, 'silence').length, 0);
  });
});

void test('mid-fight, the hero fights freely through the build-up, then no blow can land from the guard to the end of the grace', (): void => {
  const { world, thrall } = fight(40);
  world.glitch.played = world.glitch.def.rules.newCharacter;
  world.player.maxLife = 1000;
  world.player.life = 1000;
  requestGlitch(world, 'hard_cut', 'debug');
  const lifeAtStart: number = world.player.life;
  stepWorld(world, [], DT);
  const plan = must(world.glitch.active?.seam, 'seam');
  const guardAt: number = plan.times.buildUp - plan.times.guard;
  let early: number = 0;
  for (let step: number = 0; step < 200 && (world.glitch.active?.elapsed ?? Infinity) < guardAt - DT; step += 1) early += ofType(stepWorld(world, [], DT), 'skill_start').filter((event): boolean => event.actorId === thrall.id).length;
  assert.equal(world.glitch.active?.phase, 'build_up');
  assert.ok(early > 0, 'the monster keeps fighting in the build-up');
  assert.equal(attacksHeld(world), false);
  stepWorld(world, [], DT);
  stepWorld(world, [], DT);
  const active = must(world.glitch.active, 'the guarded seam');
  assert.equal(active.guarded, true);
  assert.equal(attacksHeld(world), true);
  assert.notEqual(thrall.action?.phase, 'windup');
  const guardedLife: number = world.player.life;
  const guarded: WorldEvent[] = run(world, active.duration - active.elapsed + world.glitch.def.rules.grace - DT * 2);
  assert.equal(ofType(guarded, 'damage').filter((event): boolean => event.targetTeam === 'player').length, 0);
  assert.ok(world.player.life >= guardedLife);
  assert.ok(world.player.alive);
  assert.ok(lifeAtStart >= guardedLife);
  run(world, 4);
  assert.equal(attacksHeld(world), false);
});

void test('a seam never costs position, life, gold, items, ground loot, quests or experience', (): void => {
  const world: World = harmlessFight(41, 4);
  world.monsters = [];
  world.zone = { ...world.zone, props: [] };
  world.purse = 77;
  dropOnGround(world, { x: ARENA_CENTRE.x + 2, z: ARENA_CENTRE.z }, { kind: 'gold', amount: 5 });
  run(world, 1);
  const before = JSON.stringify({ pos: world.player.pos, life: world.player.life, xp: world.player.xp, level: world.player.level, purse: world.purse, inventory: world.player.inventory, equipped: world.player.equipped, quests: world.quests, ground: world.ground.map((item) => ({ id: item.id, pos: item.pos, content: item.content })), zone: world.zone.id });
  requestGlitch(world, 'hard_cut', 'debug');
  const events: WorldEvent[] = run(world, 12);
  assert.equal(ofType(events, 'glitch_end').length, 1);
  const after = JSON.stringify({ pos: world.player.pos, life: world.player.life, xp: world.player.xp, level: world.player.level, purse: world.purse, inventory: world.player.inventory, equipped: world.player.equipped, quests: world.quests, ground: world.ground.map((item) => ({ id: item.id, pos: item.pos, content: item.content })), zone: world.zone.id });
  assert.equal(after, before);
});

void test('a monster taken by the seam dies only once the world is hidden', (): void => {
  let seen: number = 0;
  for (let seed: number = 42; seed < 90 && seen === 0; seed += 1) {
    const world: World = harmlessFight(seed, 4);
    const thrall: MonsterState = must(world.monsters[0], 'thrall');
    thrall.aggro = false;
    requestGlitch(world, 'hard_cut', 'debug');
    untilPhase(world, 'tear');
    assert.equal(thrall.alive, true);
    const mist: EventOf<'glitch_phase'> = must(ofType(untilPhase(world, 'mist'), 'glitch_phase').find((event): boolean => event.phase === 'mist'), 'mist');
    if (mist.edit !== 'monster_dead') continue;
    seen += 1;
    assert.equal(thrall.alive, false);
    assert.equal(inMist(world), true);
  }
  assert.equal(seen, 1);
});
