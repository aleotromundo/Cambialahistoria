import { terrainMap } from '../sim/nav/terrain.ts';
import type { Box3 as Box3Type } from 'three';
import { Box3, Vector2, Vector3 } from 'three';
import type { ZoneExit } from '../sim/content/types.ts';
import type { Vec2 } from '../sim/math.ts';
import { exitUnder } from '../sim/world/exits.ts';
import { aimedItem } from '../sim/world/finds.ts';
import { readyToRepeat } from '../sim/world/skills.ts';
import { stationNear } from '../sim/world/trade.ts';
import { chestNear, chestSpot } from '../sim/world/moment-chest.ts';
import type { Station } from '../sim/world/trade.ts';
import { cacheNear } from '../sim/world/caches.ts';
import type { Cache } from '../sim/world/caches.ts';
import type { Command, GroundItem, MomentState, MonsterState, NpcState, World } from '../sim/world/types.ts';
import { waypointAt } from '../sim/world/waypoints.ts';
import { portalNear } from '../sim/world/portal.ts';
import type { PortalEnd } from '../sim/world/portal-types.ts';
import type { ClickFacts, ClickResolution, InputReading, PersonPick } from './click-reading.ts';
import { describeInput, resolveClick } from './click-reading.ts';
import type { Hud } from './hud/hud-api.ts';
import type { PickCandidate, ScreenRect } from './pick.ts';
import { pickActor } from './pick.ts';
import { exitPress } from './exit-press.ts';
import type { ItemPress } from './item-press.ts';
import { itemPress } from './item-press.ts';
import type { IsoCamera } from './render/iso-camera.ts';
import { clickThrough } from './render/prop-cutaway.ts';
import { clickFloor, clickHeight } from './render/terrain-sight.ts';
import type { ActionId } from './settings/bindings.ts';
import { flaskAction, slotAction } from './settings/bindings.ts';
import type { SettingsStore } from './settings/store.ts';
import type { SurfaceRect } from './surface-rect.ts';
import { surfaceRect } from './surface-rect.ts';

export const INPUT = {
  holdInterval: 0.09,
  leftBinding: 'mouse_left',
  rightBinding: 'mouse_right',
  mouseButtons: [
    { binding: 'mouse_left', name: 'left', button: 0, bit: 1 },
    { binding: 'mouse_right', name: 'right', button: 2, bit: 2 },
  ],
  closeKey: 'Escape',
  advanceKeys: ['Space', 'Enter'],
} as const;

export interface InputHooks {
  heightOf(actorId: number): number;
  boundsOf(actorId: number, out: Box3Type): boolean;
  labelHover(): number | null;
  clickMarker(x: number, z: number, hostile: boolean): void;
  aimExit(exit: string | null): void;
  aimItem(groundId: number | null): void;
  playerAt(x: number, y: number): string | null;
  hoverPlayer(id: string | null): void;
  pressPlayer(id: string | null): boolean;
  pause(): void;
}

export interface Input {
  collect(dt: number): Command[];
  tap(clientX: number, clientY: number): void;
  holdAt(clientX: number, clientY: number): void;
  moveHold(clientX: number, clientY: number): void;
  releaseHold(): void;
  readonly hoveredId: number | null;
  readonly look: Vec2 | null;
  readonly reading: InputReading;
}

export interface MouseButton {
  readonly binding: string;
  readonly name: string;
  readonly button: number;
  readonly bit: number;
}

export interface PointerReport {
  readonly button: number;
  readonly buttons: number;
}

export interface InputSurface {
  readonly addEventListener: HTMLCanvasElement['addEventListener'];
  getBoundingClientRect(): DOMRect;
  setPointerCapture(pointerId: number): void;
  readonly style: { cursor: string };
}

export interface KeySource {
  readonly addEventListener: Window['addEventListener'];
}

export type InputCamera = Pick<IsoCamera, 'groundPoint' | 'project' | 'rayDistanceTo' | 'zoomBy'>;

export type InputHud = Pick<Hud, 'isPointerOverUi' | 'closePanels' | 'togglePanel' | 'requestMap' | 'readInput'>;

export function createInput(canvas: InputSurface, windowEvents: KeySource, world: World, camera: InputCamera, hud: InputHud, settings: SettingsStore, hooks: InputHooks): Input {
  const pointer: Vector2 = new Vector2(0, 0);
  const bottom: Vector3 = new Vector3();
  const box: Box3 = new Box3();
  const corner: Vector2 = new Vector2();
  const held: Set<string> = new Set<string>();
  const pressed: string[] = [];
  const lifted: string[] = [];
  let hoveredId: number | null = null;
  let pointerInside: boolean = false;
  let mouse: boolean = false;
  let look: Vec2 | null = null;
  let holdTimer: number = 0;
  let shift: boolean = false;
  let tapping: boolean = false;
  let pressedItem: boolean = false;
  let pressedExit: string | null = null;
  let pressedPlayer: boolean = false;
  let enteredZone: string = world.zone.id;
  let lastClick: ClickResolution | null = null;
  let overUi: boolean = false;
  const extra: Command[] = [];
  const canvasRect: SurfaceRect = surfaceRect(canvas);

  const slotFor = (binding: string): number => world.content.player.skillBar.findIndex((_entry, slot: number): boolean => settings.keys().bindingsOf(slotAction(slot)).includes(binding));

  const press = (binding: string): void => {
    if (held.has(binding)) return;
    held.add(binding);
    pressed.push(binding);
  };

  const trackPoint = (clientX: number, clientY: number): void => {
    const rect: DOMRect = canvasRect.read();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  };
  const track = (event: PointerEvent | WheelEvent): void => {
    trackPoint(event.clientX, event.clientY);
  };

  const lift = (binding: string): void => {
    if (!held.delete(binding)) return;
    lifted.push(binding);
  };
  const liftMouse = (): void => {
    for (const mouseButton of INPUT.mouseButtons) lift(mouseButton.binding);
  };
  const follow = (event: PointerReport): void => {
    for (const mouseButton of INPUT.mouseButtons) {
      if (!buttonDown(event.buttons, mouseButton)) lift(mouseButton.binding);
      else if (event.button === mouseButton.button) {
        held.add(mouseButton.binding);
        pressed.push(mouseButton.binding);
      }
    }
  };

  canvas.addEventListener('pointerdown', (event: PointerEvent): void => {
    track(event);
    shift = event.shiftKey;
    pointerInside = true;
    follow(event);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event: PointerEvent): void => {
    track(event);
    mouse = event.pointerType === 'mouse';
    shift = event.shiftKey;
    pointerInside = true;
    follow(event);
  });
  canvas.addEventListener('pointerenter', (): void => {
    canvasRect.stale();
  });
  windowEvents.addEventListener('resize', (): void => {
    canvasRect.stale();
  });
  canvas.addEventListener('pointerleave', (): void => {
    pointerInside = false;
  });
  canvas.addEventListener('pointerup', follow);
  canvas.addEventListener('pointercancel', liftMouse);
  canvas.addEventListener('lostpointercapture', liftMouse);
  canvas.addEventListener('contextmenu', (event: MouseEvent): void => event.preventDefault());
  canvas.addEventListener(
    'wheel',
    (event: WheelEvent): void => {
      event.preventDefault();
      camera.zoomBy(event.deltaY);
    },
    { passive: false },
  );
  windowEvents.addEventListener('keydown', (event: KeyboardEvent): void => {
    shift = event.shiftKey;
    if (event.repeat) return;
    const action: ActionId | null = settings.keys().actionOf(event.code);
    if (event.code === INPUT.closeKey) {
      if (hud.closePanels()) return;
      if (world.dialogue !== null) extra.push({ type: 'stop' });
      else hooks.pause();
    }
    else if (action === 'inventory') hud.togglePanel('inventory');
    else if (action === 'character') hud.togglePanel('character');
    else if (action === 'tree') hud.togglePanel('tree');
    else if (action === 'map') hud.togglePanel('map');
    else if (action === 'pause') hooks.pause();
    else if (action === 'frameRate') {
      event.preventDefault();
      settings.setShowFps(!settings.get().graphics.showFps);
    }
    else press(event.code);
  });
  windowEvents.addEventListener('keyup', (event: KeyboardEvent): void => {
    shift = event.shiftKey;
    lift(event.code);
  });
  const releaseAll = (): void => {
    for (const binding of held) lifted.push(binding);
    held.clear();
    shift = false;
  };
  windowEvents.addEventListener('blur', releaseAll);
  windowEvents.addEventListener('visibilitychange', releaseAll);

  const screenRect = (id: number): ScreenRect | null => {
    if (!hooks.boundsOf(id, box)) return null;
    let minX: number = Infinity;
    let minY: number = Infinity;
    let maxX: number = -Infinity;
    let maxY: number = -Infinity;
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          if (!camera.project(x, y, z, corner)) continue;
          minX = Math.min(minX, corner.x);
          minY = Math.min(minY, corner.y);
          maxX = Math.max(maxX, corner.x);
          maxY = Math.max(maxY, corner.y);
        }
      }
    }
    return minX > maxX ? null : { minX, minY, maxX, maxY };
  };

  const candidateFor = (kind: PickCandidate['kind'], id: number, x: number, z: number): PickCandidate => {
    bottom.set(x, 0, z);
    const body: ScreenRect | null = screenRect(id);
    return { id, kind, body, footGap: camera.rayDistanceTo(pointer, bottom, 0), depth: body === null ? 0 : -body.maxY };
  };

  const pickActors = (): PickCandidate | null => {
    const labelId: number | null = hooks.labelHover();
    if (hud.isPointerOverUi()) return null;
    if (!pointerInside) {
      const labelled: NpcState | undefined = world.npcs.find((npc: NpcState): boolean => npc.id === labelId);
      return labelled === undefined ? null : candidateFor('npc', labelled.id, labelled.pos.x, labelled.pos.z);
    }
    const rect: DOMRect = canvasRect.read();
    const point = { x: ((pointer.x + 1) / 2) * rect.width, y: ((1 - pointer.y) / 2) * rect.height };
    const candidates: PickCandidate[] = [];
    for (const monster of world.monsters) {
      if (monster.alive) candidates.push(candidateFor('monster', monster.id, monster.pos.x, monster.pos.z));
    }
    for (const npc of world.npcs) candidates.push(candidateFor('npc', npc.id, npc.pos.x, npc.pos.z));
    return pickActor(candidates, point, null);
  };

  const playerAt = (): string | null => {
    if (!pointerInside || hud.isPointerOverUi()) return null;
    const rect: DOMRect = canvasRect.read();
    return hooks.playerAt(((pointer.x + 1) / 2) * rect.width, ((1 - pointer.y) / 2) * rect.height);
  };

  const exitAt = (ground: Vec2 | null): ZoneExit | null => {
    if (ground === null || !pointerInside || hud.isPointerOverUi()) return null;
    return exitUnder(world, ground);
  };

  const itemAt = (ground: Vec2 | null): GroundItem | null => {
    if (ground === null || !pointerInside || hud.isPointerOverUi()) return null;
    return aimedItem(world, ground);
  };

  const onWaypointMark = (ground: Vec2 | null): boolean => {
    const waypoint = world.zone.waypoint;
    if (ground === null || waypoint === null || !pointerInside || hud.isPointerOverUi()) return false;
    return waypointAt(world, ground);
  };

  const chestAt = (ground: Vec2 | null): MomentState | null => {
    if (ground === null || !pointerInside || hud.isPointerOverUi()) return null;
    return chestNear(world, ground);
  };

  const portalAt = (ground: Vec2 | null): PortalEnd | null => {
    if (ground === null || !pointerInside || hud.isPointerOverUi()) return null;
    return portalNear(world, ground);
  };

  const stationAt = (ground: Vec2 | null): Station | Cache | null => {
    if (ground === null || !pointerInside || hud.isPointerOverUi()) return null;
    return stationNear(world, ground) ?? cacheNear(world, ground);
  };

  const reading = (): InputReading => ({ click: lastClick, held: INPUT.mouseButtons.filter((mouseButton: MouseButton): boolean => held.has(mouseButton.binding)).map((mouseButton: MouseButton): string => mouseButton.name), inside: pointerInside, overUi });
  hud.readInput((): string => describeInput(reading()));

  return {
    get hoveredId(): number | null {
      return hoveredId;
    },
    get look(): Vec2 | null {
      return look;
    },
    get reading(): InputReading {
      return reading();
    },
    tap(clientX: number, clientY: number): void {
      trackPoint(clientX, clientY);
      pointerInside = true;
      tapping = true;
      shift = false;
      pressed.push(INPUT.leftBinding);
      lifted.push(INPUT.leftBinding);
    },
    holdAt(clientX: number, clientY: number): void {
      trackPoint(clientX, clientY);
      pointerInside = true;
      shift = false;
      press(INPUT.leftBinding);
    },
    moveHold(clientX: number, clientY: number): void {
      trackPoint(clientX, clientY);
    },
    releaseHold(): void {
      lift(INPUT.leftBinding);
      if (pressed.includes(INPUT.leftBinding)) tapping = true;
      else pointerInside = false;
    },
    collect(dt: number): Command[] {
      const commands: Command[] = extra.splice(0, extra.length);
      if (world.zone.id !== enteredZone) {
        enteredZone = world.zone.id;
        liftMouse();
        pressedExit = null;
        pressedItem = false;
        pressedPlayer = false;
      }
      overUi = hud.isPointerOverUi();
      const picked: PickCandidate | null = pickActors();
      const target: MonsterState | null = picked?.kind === 'monster' ? (world.monsters.find((monster: MonsterState): boolean => monster.id === picked.id) ?? null) : null;
      const person: NpcState | null = picked?.kind === 'npc' ? (world.npcs.find((npc: NpcState): boolean => npc.id === picked.id) ?? null) : null;
      hoveredId = target?.id ?? person?.id ?? null;
      const other: string | null = target === null && person === null ? playerAt() : null;
      hooks.hoverPlayer(other);
      const raised: boolean = terrainMap(world.zone) !== null;
      const groundHit: Vector3 | null = camera.groundPoint(pointer, raised ? clickHeight(world.zone) : undefined, clickThrough(pointer), raised ? clickFloor(world.zone) : null);
      const ground: Vec2 | null = groundHit === null ? null : { x: groundHit.x, z: groundHit.z };
      look = mouse && pointerInside ? ground : null;
      const item: GroundItem | null = target === null && person === null && other === null ? itemAt(ground) : null;
      hooks.aimItem(item?.id ?? null);
      const exit: ZoneExit | null = target === null && person === null && other === null && item === null ? exitAt(ground) : null;
      hooks.aimExit(exit?.id ?? null);
      const chest: MomentState | null = target === null && person === null && item === null && exit === null ? chestAt(ground) : null;
      const station: Station | Cache | null = target === null && person === null && item === null && exit === null && chest === null ? stationAt(ground) : null;
      const portal: PortalEnd | null = target === null && person === null && item === null && exit === null && chest === null && station === null ? portalAt(ground) : null;
      const marked: boolean = target === null && person === null && item === null && exit === null && chest === null && station === null && portal === null && onWaypointMark(ground);
      const personPick: PersonPick = person === null ? 'none' : pointerInside ? 'body' : 'label';
      if (tapping) {
        tapping = false;
        pointerInside = false;
      }
      canvas.style.cursor = target !== null ? 'crosshair' : item !== null || exit !== null || person !== null || other !== null || chest !== null || station !== null || portal !== null || marked ? 'pointer' : 'default';
      const aim: Vec2 | null = target === null ? ground : { x: target.pos.x, z: target.pos.z };
      const fresh: Set<string> = new Set<string>(pressed.splice(0, pressed.length));
      const up: Set<string> = new Set<string>(lifted.splice(0, lifted.length));
      const leftDown: boolean = fresh.has(INPUT.leftBinding);
      if (leftDown) pressedPlayer = false;
      const tookPlayer: boolean = leftDown && !shift && world.dialogue === null && hooks.pressPlayer(other);
      if (tookPlayer) {
        fresh.delete(INPUT.leftBinding);
        pressedPlayer = true;
      }
      const facts = (freshPress: boolean, onItem: boolean, heldExit: boolean): ClickFacts => ({ fresh: freshPress, player: tookPlayer, dialogue: world.dialogue !== null, ground: aim !== null && ground !== null, target: target !== null, shift, person: personPick, item: onItem, chest: chest !== null, station: station !== null, portal: portal !== null, heldExit, exit: exit !== null, travelling: world.player.intent.type === 'travel' });
      if (tookPlayer || (leftDown && (world.dialogue !== null || aim === null || ground === null))) lastClick = resolveClick(facts(true, false, false));
      if (pressedPlayer && !held.has(INPUT.leftBinding)) {
        pressedPlayer = false;
        up.delete(INPUT.leftBinding);
      }
      world.content.player.skillBar.forEach((_entry, slot: number): void => {
        const bound: readonly string[] = settings.keys().bindingsOf(slotAction(slot));
        if (bound.some((binding: string): boolean => fresh.has(binding))) commands.push({ type: 'hold', slot, down: true });
        if (bound.some((binding: string): boolean => up.has(binding)) && !bound.some((binding: string): boolean => held.has(binding))) commands.push({ type: 'hold', slot, down: false });
      });
      holdTimer -= dt;
      const holdTick: boolean = holdTimer <= 0;
      if (holdTick) holdTimer = INPUT.holdInterval;
      if (world.dialogue !== null) {
        if (fresh.has(INPUT.leftBinding) || INPUT.advanceKeys.some((key: string): boolean => fresh.has(key))) commands.push({ type: 'advance' });
        return commands;
      }
      world.player.flasks.forEach((_flask, slot: number): void => {
        const action: ActionId | null = flaskAction(slot);
        if (action !== null && settings.keys().bindingsOf(action).some((binding: string): boolean => fresh.has(binding))) commands.push({ type: 'flask', slot });
      });
      if (aim === null || ground === null) return commands;
      const steering = world.player.action;
      if (steering !== null && steering.slot !== null && steering.skill.press !== null && settings.keys().bindingsOf(slotAction(steering.slot)).some((binding: string): boolean => held.has(binding))) commands.push({ type: 'steer', aim });

      const leftSlot: number = slotFor(INPUT.leftBinding);
      const leftFresh: boolean = fresh.has(INPUT.leftBinding);
      if (leftFresh) hud.requestMap(marked && !shift);
      const leftRepeats: boolean = leftFresh || (world.player.skills[leftSlot]?.press ?? null) === null;
      const leftHeld: boolean = held.has(INPUT.leftBinding) && !pressedPlayer;
      const itemHit: ItemPress = itemPress(pressedItem, { fresh: leftFresh, held: leftHeld, free: target === null && person === null && !shift, item: item?.id ?? null });
      pressedItem = itemHit.onItem;
      const leftTick: boolean = leftFresh || (leftHeld && holdTick);
      if (leftFresh) pressedExit = exit?.id ?? null;
      else if (!leftHeld) pressedExit = null;
      const click: ClickResolution = resolveClick(facts(leftFresh, pressedItem, pressedExit !== null));
      if (leftFresh) lastClick = click;
      if (leftFresh || leftHeld) {
        switch (click.kind) {
          case 'skill':
            if (leftRepeats && leftTick) commands.push({ type: 'skill', slot: leftSlot, aim: target === null ? ground : aim, targetId: target?.id ?? null });
            if (leftFresh && target !== null) hooks.clickMarker(target.pos.x, target.pos.z, true);
            break;
          case 'talk':
            if (leftFresh && person !== null) commands.push({ type: 'talk', npcId: person.id });
            break;
          case 'pickup':
            if (itemHit.pickup !== null && item !== null) {
              commands.push({ type: 'pickup', groundId: itemHit.pickup });
              hooks.clickMarker(item.pos.x, item.pos.z, false);
            }
            break;
          case 'open': {
            const spot: Vec2 | null = chest === null ? null : chestSpot(chest);
            if (leftFresh && chest !== null && spot !== null) {
              commands.push({ type: 'open', momentId: chest.id });
              hooks.clickMarker(spot.x, spot.z, false);
            }
            break;
          }
          case 'use':
            if (leftFresh && station !== null) {
              commands.push({ type: 'use', prop: station.index });
              hooks.clickMarker(station.placed.x, station.placed.z, false);
            }
            break;
          case 'portal':
            if (leftFresh && portal !== null) {
              commands.push({ type: 'enter_portal' });
              hooks.clickMarker(portal.pos.x, portal.pos.z, false);
            }
            break;
          case 'swallowed':
            hooks.aimExit(pressedExit);
            break;
          case 'exit': {
            if (exit === null) break;
            const through: Command | null = exitPress(exit.id, { fresh: leftFresh, travelling: world.player.intent.type === 'travel', ground });
            if (through !== null) commands.push(through);
            if (leftFresh) hooks.clickMarker(exit.x, exit.z, false);
            break;
          }
          case 'move':
            commands.push({ type: 'move', held: !leftFresh, dest: ground });
            if (leftFresh) hooks.clickMarker(ground.x, ground.z, false);
            break;
          case 'player':
          case 'advance':
          case 'none':
            break;
        }
      }

      world.content.player.skillBar.forEach((_entry, slot: number): void => {
        for (const binding of settings.keys().bindingsOf(slotAction(slot))) {
          if (binding === INPUT.leftBinding) continue;
          const isFresh: boolean = fresh.has(binding);
          if (!isFresh && !(held.has(binding) && readyToRepeat(world.player, world.player.skills[slot]))) continue;
          commands.push({ type: 'skill', slot, aim, targetId: null });
          return;
        }
      });
      return commands;
    },
  };
}

export function buttonDown(buttons: number, mouseButton: MouseButton): boolean {
  return Math.floor(buttons / mouseButton.bit) % 2 === 1;
}
