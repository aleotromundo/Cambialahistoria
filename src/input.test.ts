import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Vector3 } from 'three';
import type { Vector2 } from 'three';
import { must, worldIn, zoneOf } from '../test/support.ts';
import { loadContent } from '../sim/content/content.ts';
import type { Content, ZoneExit } from '../sim/content/types.ts';
import type { Vec2 } from '../sim/math.ts';
import { createWorld } from '../sim/world/create.ts';
import { stepWorld } from '../sim/world/step.ts';
import type { Command, EncounterState, World } from '../sim/world/types.ts';
import { wakeLength } from '../sim/world/wake.ts';
import { enterZone } from '../sim/world/zones.ts';
import { refreshPlayer } from '../sim/world/character.ts';
import type { KeyValueStore } from './backend/backend.ts';
import type { Input, InputCamera, InputHooks, InputHud, InputSurface, KeySource } from './input.ts';
import { createInput, isTextField } from './input.ts';
import { keysDirection } from './move-keys.ts';
import { CAMERA } from './render/iso-camera.ts';
import { stickMove, TOUCH } from './mobile/touch-map.ts';
import type { SlotDefault } from './settings/bindings.ts';
import type { SettingsStore } from './settings/store.ts';
import { createSettingsStore } from './settings/store.ts';

void test('pointer presses become world input only on the canvas, so a click on the HUD never moves the hero', (): void => {
  const source: string = readFileSync('src/input.ts', 'utf8');
  const listeners: string[] = [...source.matchAll(/(\w+)\.addEventListener\(\s*'(pointer\w+|mouse\w+|click|touch\w+)'/g)].map((match: RegExpExecArray): string => `${match[1] ?? ''}.${match[2] ?? ''}`);
  assert.ok(listeners.includes('canvas.pointerdown'));
  for (const listener of listeners) assert.ok(listener.startsWith('canvas.'), `${listener} listens outside the canvas`);
});

const content: Content = loadContent();
const DT: number = 1 / 60;
const VIEW = { size: 1000, span: 22 } as const;
const SLOTS: readonly SlotDefault[] = [{ name: 'Cleave', bindings: ['mouse_left'] }];

interface Rig {
  readonly world: World;
  readonly input: Input;
  readonly fire: (type: string, pointer?: Partial<FakePointer>) => void;
  readonly settings: SettingsStore;
  readonly focus: (field: EventTarget) => void;
}

interface FakePointer {
  readonly button: number;
  readonly buttons: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly pointerId: number;
  readonly pointerType: string;
  readonly shiftKey: boolean;
  readonly code: string;
  readonly repeat: boolean;
}

type Heard = Map<string, EventListenerOrEventListenerObject[]>;

function hearing(heard: Heard): (type: string, listener: EventListenerOrEventListenerObject | null) => void {
  return (type: string, listener: EventListenerOrEventListenerObject | null): void => {
    if (listener !== null) heard.set(type, [...(heard.get(type) ?? []), listener]);
  };
}

function rect(): DOMRect {
  return { x: 0, y: 0, width: VIEW.size, height: VIEW.size, top: 0, left: 0, right: VIEW.size, bottom: VIEW.size, toJSON: (): null => null };
}

interface PlayerHooks {
  readonly at: string | null;
  readonly takes: (id: string | null) => boolean;
  readonly pressed: (string | null)[];
  readonly hovered: (string | null)[];
}

function noPlayers(): PlayerHooks {
  return { at: null, takes: (): boolean => false, pressed: [], hovered: [] };
}

function rig(world: World, overUi: () => boolean = (): boolean => false, players: PlayerHooks = noPlayers(), label: () => number | null = (): number | null => null, slots: readonly SlotDefault[] = SLOTS): Rig {
  const heard: Heard = new Map<string, EventListenerOrEventListenerObject[]>();
  const canvas: InputSurface = { addEventListener: hearing(heard), getBoundingClientRect: rect, setPointerCapture: (): void => undefined, style: { cursor: 'default' } };
  const keys: KeySource = { addEventListener: hearing(heard) };
  const fire = (type: string, pointer: Partial<FakePointer> = {}): void => {
    const event: Event = Object.assign(new Event(type), { button: -1, buttons: 0, clientX: 0, clientY: 0, pointerId: 1, pointerType: 'mouse', shiftKey: false, code: '', repeat: false }, pointer);
    for (const listener of heard.get(type) ?? []) {
      if (typeof listener === 'function') listener(event);
      else listener.handleEvent(event);
    }
  };
  const camera: InputCamera = {
    groundPoint: (pointer: Vector2): Vector3 => new Vector3(world.player.pos.x + pointer.x * VIEW.span, 0, world.player.pos.z - pointer.y * VIEW.span),
    project: (): boolean => false,
    rayDistanceTo: (): number => Infinity,
    zoomBy: (): void => undefined,
  };
  const hud: InputHud = { isPointerOverUi: overUi, closePanels: (): boolean => false, togglePanel: (): void => undefined, requestMap: (): void => undefined, readInput: (): void => undefined };
  const store: KeyValueStore = { read: (): null => null, write: (): boolean => true, remove: (): void => undefined };
  const settings: SettingsStore = createSettingsStore(store, slots, { flasks: 0, ladder: false });
  const hooks: InputHooks = { heightOf: (): number => 1.8, boundsOf: (): boolean => false, labelHover: label, clickMarker: (): void => undefined, aimExit: (): void => undefined, aimItem: (): void => undefined,
    playerAt: (): string | null => players.at,
    hoverPlayer: (id: string | null): void => {
      players.hovered.push(id);
    },
    pressPlayer: (id: string | null): boolean => {
      players.pressed.push(id);
      return players.takes(id);
    },
    pause: (): void => undefined,
  };
  const focus = (field: EventTarget): void => {
    for (const listener of heard.get('focusin') ?? []) field.addEventListener('focusin', listener);
    field.dispatchEvent(new Event('focusin'));
  };
  return { world, input: createInput(canvas, keys, world, camera, hud, settings, hooks), fire, settings, focus };
}

function screenOf(world: World, ground: Vec2): Vec2 {
  const ndc: Vec2 = { x: (ground.x - world.player.pos.x) / VIEW.span, z: -(ground.z - world.player.pos.z) / VIEW.span };
  return { x: ((ndc.x + 1) / 2) * VIEW.size, z: ((1 - ndc.z) / 2) * VIEW.size };
}

function run(setup: Rig, seconds: number, done: () => boolean, extra: () => readonly Command[] = (): readonly Command[] => []): void {
  for (let clock: number = 0; clock < seconds && !done(); clock += DT) stepWorld(setup.world, [...setup.input.collect(DT), ...extra()], DT);
}

function voidWithLight(seed: number): World {
  const world: World = createWorld(content, { seed, save: null, opening: true });
  const wake = must(world.wake, 'wake');
  for (let step: number = 0; step < Math.ceil(wakeLength(wake.plan) / DT) + 1; step += 1) stepWorld(world, [], DT);
  Object.assign(world.flags, { opening: 'read', first_choice: 'took_journal', first_blade: 'found' });
  for (let clock: number = 0; clock < 90 && !world.encounters.some((state: EncounterState): boolean => state.pos !== null); clock += DT) {
    stepWorld(world, [{ type: 'move', held: true, dest: { x: world.player.pos.x + world.heading.x * 6, z: world.player.pos.z + world.heading.z * 6 } }], DT);
  }
  stepWorld(world, [{ type: 'stop' }], DT);
  return world;
}

function lightOf(world: World): ZoneExit {
  return must(world.zone.exits[0], 'light exit');
}

function arrivedBy(zoneId: string, exitId: string): World {
  const world: World = worldIn(content, zoneId, 5);
  const came: string | undefined = zoneOf(content, zoneId).exits.find((entry: ZoneExit): boolean => entry.id === exitId)?.to;
  if (came !== undefined) world.visited.push(came);
  enterZone(world, zoneOf(content, zoneId), { type: 'exit', exit: exitId });
  world.events = [];
  return world;
}

function toward(from: Vec2, to: Vec2, metres: number): Vec2 {
  const gap: number = Math.hypot(to.x - from.x, to.z - from.z);
  return { x: from.x + ((to.x - from.x) / gap) * metres, z: from.z + ((to.z - from.z) / gap) * metres };
}

void test('holding the pointer still, far ahead toward the light, walks the hero into it but never through', (): void => {
  const world: World = voidWithLight(11);
  const setup: Rig = rig(world);
  const from: string = world.zone.id;
  const point: Vec2 = screenOf(world, toward(world.player.pos, lightOf(world), VIEW.span * 0.7));
  setup.input.holdAt(point.x, point.z);
  run(setup, 20, (): boolean => world.zone.id !== from);
  assert.equal(world.zone.id, from);
});

void test('a held pointer dragged across the light and resting on it never carries the hero through', (): void => {
  const world: World = voidWithLight(12);
  const setup: Rig = rig(world);
  const from: string = world.zone.id;
  const start: Vec2 = screenOf(world, toward(world.player.pos, lightOf(world), 3));
  setup.input.holdAt(start.x, start.z);
  run(setup, 0.3, (): boolean => false);
  const onLight: Vec2 = screenOf(world, lightOf(world));
  setup.input.moveHold(onLight.x, onLight.z);
  run(setup, 20, (): boolean => world.zone.id !== from);
  assert.equal(world.zone.id, from);
});

void test('a tap on the ground inside the light travels', (): void => {
  const world: World = voidWithLight(13);
  const setup: Rig = rig(world);
  const from: string = world.zone.id;
  const inside: Vec2 = screenOf(world, toward(lightOf(world), world.player.pos, lightOf(world).radius * 0.5));
  setup.input.tap(inside.x, inside.z);
  run(setup, 60, (): boolean => world.zone.id !== from);
  assert.notEqual(world.zone.id, from);
});

void test('the stick held toward the light never walks the hero through it', (): void => {
  const world: World = voidWithLight(14);
  const setup: Rig = rig(world);
  const from: string = world.zone.id;
  let moving: boolean = false;
  run(setup, 20, (): boolean => world.zone.id !== from, (): readonly Command[] => {
    const light: ZoneExit = lightOf(world);
    const gap: number = Math.hypot(light.x - world.player.pos.x, light.z - world.player.pos.z);
    const command = stickMove(world.player.pos, { x: (light.x - world.player.pos.x) / gap, z: (light.z - world.player.pos.z) / gap }, moving);
    moving = true;
    return command === null ? [] : [command];
  });
  assert.equal(world.zone.id, from);
});

void test('every zone exit travels by a press that starts on it, held or tapped', (): void => {
  const exits: readonly { readonly zone: string; readonly exit: string }[] = [
    { zone: 'hall_of_time', exit: 'mist' },
    { zone: 'hall_of_time', exit: 'east' },
    { zone: 'hideout', exit: 'west' },
  ];
  for (const { zone, exit } of exits) {
    for (const press of ['held', 'click'] as const) {
      const world: World = arrivedBy(zone, exit);
      const setup: Rig = rig(world);
      const target: ZoneExit = must(world.zone.exits.find((entry: ZoneExit): boolean => entry.id === exit), exit);
      const point: Vec2 = screenOf(world, target);
      if (press === 'held') setup.input.holdAt(point.x, point.z);
      else setup.input.tap(point.x, point.z);
      run(setup, 30, (): boolean => world.zone.id !== zone);
      assert.equal(world.zone.id, target.to, `${press} on ${zone}.${exit}: ${JSON.stringify(world.player.intent)} at ${world.player.pos.x.toFixed(1)},${world.player.pos.z.toFixed(1)} exit ${target.x},${target.z} r ${target.radius}`);
    }
  }
});

void test('a held walk across the waypoint keeps walking past it', (): void => {
  const world: World = worldIn(content, 'hideout', 6);
  const mark = must(world.zone.waypoint, 'waypoint');
  const start: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  const gap: number = Math.hypot(mark.x - start.x, mark.z - start.z);
  const dir: Vec2 = { x: (mark.x - start.x) / gap, z: (mark.z - start.z) / gap };
  const setup: Rig = rig(world);
  const point: Vec2 = screenOf(world, toward(world.player.pos, mark, 5));
  setup.input.holdAt(point.x, point.z);
  const along = (): number => (world.player.pos.x - start.x) * dir.x + (world.player.pos.z - start.z) * dir.z;
  run(setup, 30, (): boolean => along() > gap + 2);
  assert.ok(along() > gap + 2, `stopped ${(gap - along()).toFixed(2)} m short of the waypoint`);
});

void test('a held walk that began on the ground keeps walking into an open exit while the pointer drifts over the HUD, and never travels', (): void => {
  const world: World = arrivedBy('hall_of_time', 'east');
  let overHud: boolean = false;
  const setup: Rig = rig(world, (): boolean => overHud);
  const exit: ZoneExit = must(world.zone.exits.find((entry: ZoneExit): boolean => entry.id === 'east'), 'east exit');
  const start: Vec2 = screenOf(world, toward(world.player.pos, exit, 1.5));
  setup.input.holdAt(start.x, start.z);
  run(setup, 0.2, (): boolean => false);
  overHud = true;
  const beyond: Vec2 = screenOf(world, { x: exit.x + 2, z: exit.z });
  setup.input.moveHold(beyond.x, beyond.z);
  run(setup, 10, (): boolean => world.zone.id !== 'hall_of_time');
  assert.equal(world.zone.id, 'hall_of_time');
  assert.ok(Math.hypot(exit.x - world.player.pos.x, exit.z - world.player.pos.z) <= exit.radius + 1, 'he stopped short of the exit');
});

function talkingToGuide(): World {
  const world: World = worldIn(content, 'hideout', 7);
  for (const quest of content.quests.values()) if (quest.id !== 'wardens_lesson') world.quests[quest.id] = quest.objectives.length;
  world.quests['wardens_lesson'] = 0;
  const guide = must(world.npcs.find((npc): boolean => npc.def.id === 'warden_guide'), 'guide');
  world.player.pos.x = guide.pos.x + 1;
  world.player.pos.z = guide.pos.z;
  stepWorld(world, [{ type: 'talk', npcId: guide.id }], DT);
  for (let step: number = 0; step < 60 && world.dialogue === null; step += 1) stepWorld(world, [], DT);
  assert.equal(world.dialogue?.talk.id, 'warden_guide_lesson');
  return world;
}

void test('one click anywhere in the world closes the guide\'s one-line lesson and completes the objective', (): void => {
  const world: World = talkingToGuide();
  const setup: Rig = rig(world);
  setup.input.holdAt(200, 300);
  run(setup, 0.15, (): boolean => false);
  setup.input.releaseHold();
  run(setup, 0.1, (): boolean => false);
  assert.equal(world.dialogue, null);
  assert.equal(world.quests['wardens_lesson'], 1);
});

void test('one phone tap closes the guide\'s one-line lesson and completes the objective', (): void => {
  const world: World = talkingToGuide();
  const setup: Rig = rig(world);
  setup.input.tap(200, 300);
  run(setup, 0.1, (): boolean => false);
  assert.equal(world.dialogue, null);
  assert.equal(world.quests['wardens_lesson'], 1);
});

function hideoutWorld(): World {
  return worldIn(content, 'hideout', 3);
}

void test('a tap on another player opens their menu and never walks or uses a skill', (): void => {
  const world: World = hideoutWorld();
  const players: PlayerHooks = { at: 'p1', takes: (id: string | null): boolean => id !== null, pressed: [], hovered: [] };
  const setup: Rig = rig(world, (): boolean => false, players);
  const point: Vec2 = screenOf(world, { x: world.player.pos.x + 4, z: world.player.pos.z });
  setup.input.tap(point.x, point.z);
  const commands: readonly Command[] = setup.input.collect(DT);
  assert.deepEqual(players.pressed, ['p1']);
  assert.ok(players.hovered.includes('p1'));
  assert.deepEqual(commands.filter((command: Command): boolean => command.type === 'move' || command.type === 'skill' || command.type === 'hold'), []);
});

void test('a held press that began on another player never turns into a walk', (): void => {
  const world: World = hideoutWorld();
  const players: PlayerHooks = { at: 'p1', takes: (id: string | null): boolean => id !== null, pressed: [], hovered: [] };
  const setup: Rig = rig(world, (): boolean => false, players);
  const point: Vec2 = screenOf(world, { x: world.player.pos.x + 4, z: world.player.pos.z });
  setup.input.holdAt(point.x, point.z);
  const moves: Command[] = [];
  for (let frame: number = 0; frame < 30; frame += 1) moves.push(...setup.input.collect(DT).filter((command: Command): boolean => command.type === 'move' || command.type === 'skill'));
  setup.input.releaseHold();
  moves.push(...setup.input.collect(DT).filter((command: Command): boolean => command.type === 'move' || command.type === 'skill'));
  assert.deepEqual(moves, []);
  assert.deepEqual(players.pressed, ['p1']);
});

void test('a press that closes an open player menu is taken by it, and the next press walks', (): void => {
  const world: World = hideoutWorld();
  let open: boolean = true;
  const players: PlayerHooks = {
    at: null,
    takes: (): boolean => {
      const took: boolean = open;
      open = false;
      return took;
    },
    pressed: [],
    hovered: [],
  };
  const setup: Rig = rig(world, (): boolean => false, players);
  const point: Vec2 = screenOf(world, { x: world.player.pos.x + 4, z: world.player.pos.z });
  setup.input.tap(point.x, point.z);
  assert.deepEqual(setup.input.collect(DT).filter((command: Command): boolean => command.type === 'move'), []);
  setup.input.tap(point.x, point.z);
  assert.equal(setup.input.collect(DT).filter((command: Command): boolean => command.type === 'move').length, 1);
  assert.deepEqual(players.pressed, [null, null]);
});

const LEFT = { button: 0, bit: 1 } as const;
const RIGHT = { button: 2, bit: 2 } as const;

function at(point: Vec2, button: number, buttons: number): Partial<FakePointer> {
  return { clientX: point.x, clientY: point.z, button, buttons };
}

function clickOn(setup: Rig, point: Vec2): Command[] {
  setup.fire('pointermove', at(point, -1, 0));
  setup.fire('pointerdown', at(point, LEFT.button, LEFT.bit));
  const commands: Command[] = setup.input.collect(DT);
  setup.fire('pointerup', at(point, LEFT.button, 0));
  return [...commands, ...setup.input.collect(DT)];
}

function freshMoves(commands: readonly Command[]): Command[] {
  return commands.filter((command: Command): boolean => command.type === 'move' && !command.held);
}

function besideDownExit(): { readonly world: World; readonly exit: ZoneExit } {
  const world: World = worldIn(content, 'under_hall', 21);
  const exit: ZoneExit = must(world.zone.exits.find((entry: ZoneExit): boolean => entry.to === 'under_hall_2'), 'under_hall down exit');
  world.player.pos.x = exit.x;
  world.player.pos.z = exit.z - exit.radius - 2;
  world.monsters = [];
  return { world, exit };
}

function floorAhead(world: World): Vec2 {
  return screenOf(world, { x: world.player.pos.x + 3, z: world.player.pos.z + 3 });
}

void test('a chorded press (left down, right down, left up, right up) leaves no button held, so the next left click walks', (): void => {
  const world: World = worldIn(content, 'under_hall_2', 22);
  const setup: Rig = rig(world);
  const point: Vec2 = floorAhead(world);
  setup.fire('pointerdown', at(point, LEFT.button, LEFT.bit));
  setup.input.collect(DT);
  setup.fire('pointermove', at(point, RIGHT.button, LEFT.bit + RIGHT.bit));
  setup.input.collect(DT);
  setup.fire('pointermove', at(point, LEFT.button, RIGHT.bit));
  setup.input.collect(DT);
  setup.fire('pointerup', at(point, RIGHT.button, 0));
  setup.input.collect(DT);
  assert.deepEqual(setup.input.collect(DT).filter((command: Command): boolean => command.type === 'move'), []);
  assert.equal(freshMoves(clickOn(setup, point)).length, 1);
});

void test('a chorded press that began on the exit down out of Hourfall Caves never swallows the clicks after it', (): void => {
  const { world, exit } = besideDownExit();
  const setup: Rig = rig(world);
  const onExit: Vec2 = screenOf(world, exit);
  setup.fire('pointermove', at(onExit, -1, 0));
  setup.fire('pointerdown', at(onExit, LEFT.button, LEFT.bit));
  setup.fire('pointermove', at(onExit, RIGHT.button, LEFT.bit + RIGHT.bit));
  setup.fire('pointermove', at(onExit, LEFT.button, RIGHT.bit));
  setup.fire('pointerup', at(onExit, RIGHT.button, 0));
  run(setup, 30, (): boolean => world.zone.id !== 'under_hall');
  assert.equal(world.zone.id, 'under_hall_2');
  run(setup, 0.5, (): boolean => false);
  assert.equal(freshMoves(clickOn(setup, floorAhead(world))).length, 1);
});

void test('a release that never reaches the canvas is healed by the next pointer event, and the next press is a fresh click', (): void => {
  const world: World = worldIn(content, 'under_hall_2', 23);
  const setup: Rig = rig(world);
  const point: Vec2 = floorAhead(world);
  setup.fire('pointerdown', at(point, LEFT.button, LEFT.bit));
  setup.input.collect(DT);
  setup.fire('pointermove', at(point, -1, 0));
  setup.input.collect(DT);
  assert.deepEqual(setup.input.collect(DT).filter((command: Command): boolean => command.type === 'move'), []);
  setup.fire('pointerdown', at(point, LEFT.button, LEFT.bit));
  assert.equal(freshMoves(setup.input.collect(DT)).length, 1);
  setup.fire('pointerdown', at(point, LEFT.button, LEFT.bit));
  assert.equal(freshMoves(setup.input.collect(DT)).length, 1);
});

void test('a lost pointer capture, a cancelled pointer, a blur or a hidden tab each end the press', (): void => {
  for (const ending of ['lostpointercapture', 'pointercancel', 'blur', 'visibilitychange']) {
    const world: World = worldIn(content, 'under_hall_2', 24);
    const setup: Rig = rig(world);
    const point: Vec2 = floorAhead(world);
    setup.fire('pointerdown', at(point, LEFT.button, LEFT.bit));
    setup.input.collect(DT);
    setup.fire(ending, at(point, -1, LEFT.bit));
    setup.input.collect(DT);
    const after: Command[] = [];
    for (let frame: number = 0; frame < 20; frame += 1) after.push(...setup.input.collect(DT));
    assert.deepEqual(after.filter((command: Command): boolean => command.type === 'move'), [], ending);
  }
});

void test('a press on the exit down out of Hourfall Caves held through the zone change ends there, wherever it is released', (): void => {
  for (const release of ['under the veil', 'after arrival', 'over the HUD', 'never']) {
    const { world, exit } = besideDownExit();
    let overHud: boolean = false;
    const setup: Rig = rig(world, (): boolean => overHud);
    const onExit: Vec2 = screenOf(world, exit);
    setup.fire('pointermove', at(onExit, -1, 0));
    setup.fire('pointerdown', at(onExit, LEFT.button, LEFT.bit));
    stepWorld(world, setup.input.collect(DT), DT);
    if (release === 'over the HUD') {
      overHud = true;
      setup.fire('pointermove', at({ x: VIEW.size / 2, z: VIEW.size - 4 }, -1, LEFT.bit));
    }
    run(setup, 30, (): boolean => world.zone.id !== 'under_hall');
    assert.equal(world.zone.id, 'under_hall_2', release);
    if (release === 'under the veil' || release === 'over the HUD') setup.fire('pointerup', at(onExit, LEFT.button, 0));
    const held: Command[] = [];
    for (let frame: number = 0; frame < 30; frame += 1) held.push(...setup.input.collect(DT));
    assert.deepEqual(held.filter((command: Command): boolean => command.type === 'move' || command.type === 'travel'), [], release);
    if (release === 'after arrival') setup.fire('pointerup', at(onExit, LEFT.button, 0));
    overHud = false;
    assert.equal(freshMoves(clickOn(setup, floorAhead(world))).length, 1, release);
  }
});

void test('a press on an exit that is released and pressed again within one frame on the ground walks', (): void => {
  const { world, exit } = besideDownExit();
  const setup: Rig = rig(world);
  const onExit: Vec2 = screenOf(world, exit);
  setup.fire('pointermove', at(onExit, -1, 0));
  setup.fire('pointerdown', at(onExit, LEFT.button, LEFT.bit));
  assert.ok(setup.input.collect(DT).some((command: Command): boolean => command.type === 'travel'));
  const ground: Vec2 = screenOf(world, { x: world.player.pos.x - 3, z: world.player.pos.z - 2 });
  setup.fire('pointerup', at(onExit, LEFT.button, 0));
  setup.fire('pointermove', at(ground, -1, 0));
  setup.fire('pointerdown', at(ground, LEFT.button, LEFT.bit));
  assert.equal(freshMoves(setup.input.collect(DT)).length, 1);
});

void test('a name label that is still reported hovered never turns a click on open ground into a talk with that person', (): void => {
  const world: World = hideoutWorld();
  const lookout = must(world.npcs.find((npc): boolean => npc.def.id === 'warden_lookout'), 'lookout');
  const setup: Rig = rig(world, (): boolean => false, noPlayers(), (): number | null => lookout.id);
  const ground: Vec2 = { x: world.player.pos.x - 6, z: world.player.pos.z + 1 };
  assert.ok(Math.hypot(ground.x - lookout.pos.x, ground.z - lookout.pos.z) > 3, 'the ground is away from the lookout');
  const commands: Command[] = clickOn(setup, screenOf(world, ground));
  assert.deepEqual(commands.filter((command: Command): boolean => command.type === 'talk'), []);
  assert.equal(freshMoves(commands).length, 1);
  assert.equal(setup.input.hoveredId, null);
  assert.deepEqual(setup.input.reading, { click: { kind: 'move', reason: null }, held: [], inside: true, overUi: false, toggled: null });
});

void test('the input reading reports a held press, a no-ground click and a press taken by another player, as collect resolved them', (): void => {
  const world: World = hideoutWorld();
  const players: PlayerHooks = { at: 'p1', takes: (id: string | null): boolean => id !== null, pressed: [], hovered: [] };
  const setup: Rig = rig(world, (): boolean => false, players);
  const point: Vec2 = screenOf(world, { x: world.player.pos.x + 4, z: world.player.pos.z });
  setup.fire('pointermove', at(point, -1, 0));
  setup.fire('pointerdown', at(point, LEFT.button, LEFT.bit));
  setup.input.collect(DT);
  assert.deepEqual(setup.input.reading, { click: { kind: 'player', reason: 'another player under pointer or their menu open' }, held: ['left'], inside: true, overUi: false, toggled: null });
  setup.fire('pointerup', at(point, LEFT.button, 0));
  setup.input.collect(DT);
  assert.deepEqual(setup.input.reading.held, []);
});


const YAW: number = (CAMERA.yawDegrees * Math.PI) / 180;

function walks(commands: readonly Command[]): Command[] {
  return commands.filter((command: Command): boolean => command.type === 'walk' || command.type === 'stop');
}

void test('with the keys moving the hero, a held W walks up the screen every frame and its release stops once', (): void => {
  const world: World = worldIn(content, 'under_hall_2', 22);
  const setup: Rig = rig(world);
  setup.settings.setMovement('keys');
  const up: Vec2 = must(keysDirection({ up: true, down: false, left: false, right: false }, YAW), 'up');
  const from: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  setup.fire('keydown', { code: 'KeyW' });
  assert.deepEqual(walks(setup.input.collect(DT)), [{ type: 'walk', held: false, dest: { x: from.x + up.x * TOUCH.stickReach, z: from.z + up.z * TOUCH.stickReach } }]);
  assert.deepEqual(walks(setup.input.collect(DT)).map((command: Command): string => (command.type === 'walk' ? `walk ${command.held}` : command.type)), ['walk true']);
  setup.fire('keyup', { code: 'KeyW' });
  assert.deepEqual(walks(setup.input.collect(DT)), [{ type: 'stop' }]);
  assert.deepEqual(walks(setup.input.collect(DT)), []);
});

void test('with the keys moving the hero, the hero really walks the way the key points', (): void => {
  const world: World = worldIn(content, 'under_hall_2', 22);
  const setup: Rig = rig(world);
  setup.settings.setMovement('keys');
  const from: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  const reached: number[] = [];
  for (const [code, keys] of [['KeyW', { up: true, down: false, left: false, right: false }], ['KeyS', { up: false, down: true, left: false, right: false }]] as const) {
    world.player.pos.x = from.x;
    world.player.pos.z = from.z;
    const way: Vec2 = must(keysDirection(keys, YAW), code);
    setup.fire('keydown', { code });
    run(setup, 0.6, (): boolean => false);
    setup.fire('keyup', { code });
    run(setup, 0.1, (): boolean => false);
    reached.push((world.player.pos.x - from.x) * way.x + (world.player.pos.z - from.z) * way.z);
  }
  assert.ok(Math.max(...reached) > 1, `the hero walked ${reached.join(' and ')} along the keys`);
});

void test('with the keys moving the hero, a press on open ground never walks there', (): void => {
  const world: World = worldIn(content, 'under_hall_2', 22);
  const setup: Rig = rig(world);
  setup.settings.setMovement('keys');
  const commands: Command[] = clickOn(setup, floorAhead(world));
  assert.deepEqual(commands.filter((command: Command): boolean => command.type === 'move'), []);
  assert.deepEqual(commands.filter((command: Command): boolean => command.type === 'skill').map((command: Command): number | null => (command.type === 'skill' ? command.slot : null)), [0]);
  assert.equal(setup.input.reading.click?.kind, 'skill');
});

void test('while a click moves the hero, W never walks', (): void => {
  const world: World = worldIn(content, 'under_hall_2', 22);
  const setup: Rig = rig(world);
  setup.fire('keydown', { code: 'KeyW' });
  assert.deepEqual(walks(setup.input.collect(DT)), []);
});

void test('a move key held while a text field takes the focus is let go, and a button taking the focus changes nothing', (): void => {
  const world: World = worldIn(content, 'under_hall_2', 22);
  const setup: Rig = rig(world);
  setup.settings.setMovement('keys');
  setup.fire('keydown', { code: 'KeyD' });
  assert.equal(walks(setup.input.collect(DT))[0]?.type, 'walk');
  setup.focus(new EventTarget());
  assert.equal(walks(setup.input.collect(DT))[0]?.type, 'walk');
  const field: EventTarget = Object.assign(new EventTarget(), { selectionStart: 0 });
  assert.equal(isTextField(field), true);
  assert.equal(isTextField(null), false);
  setup.focus(field);
  assert.deepEqual(walks(setup.input.collect(DT)), [{ type: 'stop' }]);
});

const KEYED_SPIN: readonly SlotDefault[] = [
  { name: 'Left', bindings: ['mouse_left'] },
  { name: 'Spin', bindings: ['KeyQ'] },
  { name: 'Bolt', bindings: ['KeyW'] },
];

function spinner(seed: number): World {
  const world: World = worldIn(content, 'under_hall_2', seed);
  world.monsters = [];
  world.player.bar = world.player.bar.map((_id: string | null, slot: number): string | null => (slot === 1 ? 'cleave_millwheel' : slot === 2 ? 'storm_bolt' : null));
  refreshPlayer(world);
  assert.equal(world.player.skills[1]?.id, 'cleave_millwheel');
  assert.equal(world.player.skills[0] ?? null, null);
  return world;
}

function spinning(world: World): boolean {
  return world.player.action?.skill.id === 'cleave_millwheel' && world.player.action.phase !== 'recovery';
}

function play(setup: Rig, seconds: number, sent: Command[] = []): Command[] {
  for (let clock: number = 0; clock < seconds; clock += DT) {
    setup.world.player.mana = setup.world.player.stats.maxMana;
    const commands: Command[] = setup.input.collect(DT);
    sent.push(...commands);
    stepWorld(setup.world, commands, DT);
  }
  return sent;
}

function pointAt(setup: Rig, ground: Vec2): Vec2 {
  const point: Vec2 = screenOf(setup.world, ground);
  setup.fire('pointermove', at(point, -1, 0));
  return point;
}

void test('the Millwheel held on a key spins while the key is held, glides toward the cursor and left clicks, and a left click walks once it ends', (): void => {
  const world: World = spinner(31);
  const setup: Rig = rig(world, (): boolean => false, noPlayers(), (): number | null => null, KEYED_SPIN);
  const start: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  pointAt(setup, { x: start.x + 6, z: start.z });
  setup.fire('keydown', { code: 'KeyQ' });
  const steered: Command[] = play(setup, 1.2);
  assert.ok(spinning(world), `spin started: ${JSON.stringify(world.player.action?.phase ?? null)}`);
  assert.ok(steered.some((command: Command): boolean => command.type === 'steer'), 'the held key steers');
  assert.ok(world.player.pos.x > start.x + 1, `glided toward the cursor: ${(world.player.pos.x - start.x).toFixed(2)} m`);
  const before: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  const west: Vec2 = { x: before.x - 6, z: before.z };
  const point: Vec2 = pointAt(setup, west);
  setup.fire('pointerdown', at(point, LEFT.button, LEFT.bit));
  const clicked: Command[] = play(setup, 0.1);
  setup.fire('pointerup', at(point, LEFT.button, 0));
  play(setup, 0.8, clicked);
  assert.ok(clicked.some((command: Command): boolean => command.type === 'move' && !command.held), 'the left click sends a move');
  assert.equal(setup.input.reading.click?.kind, 'move');
  assert.ok(spinning(world), 'the left click does not end the spin');
  assert.ok(world.player.pos.x < before.x - 1, `glided toward the click: ${(world.player.pos.x - before.x).toFixed(2)} m`);
  setup.fire('keyup', { code: 'KeyQ' });
  play(setup, 1.5);
  assert.ok(!spinning(world), 'releasing the key ends the spin');
  const after: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  const walk: Command[] = clickOn(setup, pointAt(setup, { x: after.x, z: after.z + 5 }));
  assert.equal(freshMoves(walk).length, 1);
  stepWorld(world, walk, DT);
  play(setup, 0.6);
  assert.ok(world.player.pos.z > after.z + 1, `a click after the spin walks: ${JSON.stringify({ intent: world.player.intent, action: world.player.action?.phase ?? null, queued: world.player.queued, from: after, now: world.player.pos })}`);
});

void test('with held skills on press to toggle, one press keeps the Millwheel turning and steering until the same key, another skill or the sim ends it', (): void => {
  for (const ending of ['same key', 'another skill', 'no mana']) {
    const world: World = spinner(32);
    const setup: Rig = rig(world, (): boolean => false, noPlayers(), (): number | null => null, KEYED_SPIN);
    setup.settings.setHeldSkills('toggle');
    const start: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
    pointAt(setup, { x: start.x + 6, z: start.z });
    setup.fire('keydown', { code: 'KeyQ' });
    play(setup, 0.05);
    setup.fire('keyup', { code: 'KeyQ' });
    const sent: Command[] = play(setup, 1.5);
    assert.ok(spinning(world), `${ending}: the spin keeps turning after the key is let go`);
    assert.ok(sent.some((command: Command): boolean => command.type === 'steer'), `${ending}: the toggled spin steers`);
    assert.ok(world.player.pos.x > start.x + 1, `${ending}: glided toward the cursor`);
    assert.equal(setup.input.reading.toggled, 'Millwheel');
    if (ending === 'same key') {
      setup.fire('keydown', { code: 'KeyQ' });
      const off: Command[] = play(setup, 0.05);
      setup.fire('keyup', { code: 'KeyQ' });
      assert.deepEqual(off.filter((command: Command): boolean => command.type === 'skill'), [], 'the second press only ends the spin');
    } else if (ending === 'another skill') {
      setup.fire('keydown', { code: 'KeyW' });
      play(setup, 0.05);
      setup.fire('keyup', { code: 'KeyW' });
    } else {
      for (let clock: number = 0; clock < 2 && spinning(world); clock += DT) {
        world.player.mana = 0;
        stepWorld(world, setup.input.collect(DT), DT);
      }
    }
    play(setup, 1.5);
    assert.ok(!spinning(world), `${ending}: the spin ended`);
    assert.equal(setup.input.reading.toggled, null, ending);
    assert.deepEqual(world.player.held, [], ending);
  }
});

void test('with held skills on hold, letting go of the key ends the spin as before', (): void => {
  const world: World = spinner(33);
  const setup: Rig = rig(world, (): boolean => false, noPlayers(), (): number | null => null, KEYED_SPIN);
  setup.fire('keydown', { code: 'KeyQ' });
  play(setup, 0.6);
  assert.ok(spinning(world));
  setup.fire('keyup', { code: 'KeyQ' });
  play(setup, 1.5);
  assert.ok(!spinning(world));
  assert.equal(setup.input.reading.toggled, null);
});

