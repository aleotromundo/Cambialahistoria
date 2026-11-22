import { Vector2 } from 'three';
import type { Action } from '../../sim/rl/contract.ts';
import { NO_ACTION } from '../../sim/rl/contract.ts';
import type { RivalDuel, RivalPilot } from '../../sim/rl/rival.ts';
import { beginRivalDuel, resignRivalDuel, rivalCommands, rivalHeard, rivalOf, startRivalDuel } from '../../sim/rl/rival.ts';
import type { Command, PlayerState, World, WorldEvent } from '../../sim/world/types.ts';
import type { IsoCamera } from '../render/iso-camera.ts';
import { CAMERA, liftAt } from '../render/iso-camera.ts';
import type { DuelFraming, DuelShot, FrameKeep, FrameLens, GroundHeight, GroundSpot, ScreenBox } from '../watch/duel-frame.ts';
import { createDuelFraming, DUEL_FRAME, lensView, stepDuelFraming } from '../watch/duel-frame.ts';
import type { LifeRow } from '../watch/duel-lives.ts';
import type { DuelLivesView, TagSpot } from '../watch/duel-lives-view.ts';
import { rivalLives, rivalVerdict } from './rival-lives.ts';

export const RIVAL_PLAY = {
  tagHeight: 2.55,
} as const;

export type RivalLivesView = Pick<DuelLivesView, 'show' | 'place' | 'cover' | 'close'>;

export type RivalCamera = Pick<IsoCamera, 'holdDistance' | 'project'>;

export interface RivalHud {
  covers(): readonly ScreenBox[];
  resignable(shown: boolean): void;
}

export interface RivalPlayDeps {
  readonly world: World;
  readonly camera: RivalCamera;
  readonly lens: FrameLens;
  readonly openLives: () => RivalLivesView;
  readonly openHud: (resign: () => void) => RivalHud;
  readonly pushFog: (by: number) => void;
  readonly loadPilot: () => Promise<RivalPilot>;
  readonly seed: () => number;
  readonly warn: (message: string) => void;
}

export interface RivalPlay {
  enter(): void;
  commands(dt: number): Command[];
  heard(events: readonly WorldEvent[]): void;
  aim(dt: number): GroundSpot | null;
  show(shown: boolean): void;
  resign(): void;
}

type PilotState = 'none' | 'loading' | 'ready' | 'failed';

const NO_COVERS: readonly ScreenBox[] = [];

function standStill(): Action {
  return NO_ACTION;
}

export function createRivalPlay(deps: RivalPlayDeps): RivalPlay {
  const { world, camera, lens, pushFog }: RivalPlayDeps = deps;
  const screen: Vector2 = new Vector2();
  const ground: GroundHeight = (x: number, z: number): number => liftAt(world.zone, x, z);
  let duel: RivalDuel | null = null;
  let begun: boolean = false;
  let pilot: RivalPilot = standStill;
  let pilotState: PilotState = 'none';
  let lives: RivalLivesView | null = null;
  let hud: RivalHud | null = null;
  let framing: DuelFraming = createDuelFraming();
  const steer: RivalPilot = (obs: Float32Array, mask: Uint8Array): Action => pilot(obs, mask);

  const load = (): void => {
    if (pilotState === 'loading' || pilotState === 'ready') return;
    pilotState = 'loading';
    void deps.loadPilot().then(
      (loaded: RivalPilot): boolean => {
        pilot = loaded;
        pilotState = 'ready';
        return true;
      },
      (error: unknown): boolean => {
        pilotState = 'failed';
        deps.warn(`The rival's model could not be loaded, so the rival stands still: ${String(error)}`);
        return false;
      },
    );
  };

  const close = (): void => {
    if (duel === null) return;
    duel = null;
    begun = false;
    lives?.close();
    hud?.resignable(false);
    camera.holdDistance(CAMERA.distance);
    pushFog(0);
  };

  const resign = (): void => {
    if (duel !== null && begun) resignRivalDuel(duel, world);
  };

  return {
    enter: (): void => {
      close();
      duel = startRivalDuel(world, deps.seed());
      if (duel === null) return;
      load();
      framing = createDuelFraming();
      lives ??= deps.openLives();
      hud ??= deps.openHud(resign);
    },
    commands: (dt: number): Command[] => (duel === null || !begun ? [] : rivalCommands(duel, world, steer, dt)),
    heard: (events: readonly WorldEvent[]): void => {
      if (duel !== null) rivalHeard(duel, world, events);
    },
    aim: (dt: number): GroundSpot | null => {
      if (duel === null || lives === null) return null;
      const rival: PlayerState | null = rivalOf(duel, world);
      if (rival === null) return null;
      const keep: FrameKeep = { covers: begun && hud !== null ? hud.covers() : NO_COVERS };
      const shot: DuelShot = stepDuelFraming(framing, world.player.pos, rival.pos, lensView(lens, lives.cover()), ground, dt, keep);
      camera.holdDistance(shot.distance);
      pushFog(shot.distance - DUEL_FRAME.nearest);
      return { x: shot.x, z: shot.z };
    },
    show: (shown: boolean): void => {
      if (duel === null || lives === null) return;
      if (!begun) {
        if (!shown || pilotState === 'loading') return;
        begun = true;
        beginRivalDuel(duel, world);
      }
      const rival: PlayerState | null = rivalOf(duel, world);
      const rows: LifeRow[] = rivalLives(duel.outcome, world.player, rival);
      lives.show(rows, rivalVerdict(duel.outcome));
      hud?.resignable(shown && duel.outcome === 'fighting');
      const heroes: readonly (PlayerState | null)[] = [world.player, rival];
      const spots: TagSpot[] = heroes.map((hero: PlayerState | null): TagSpot => {
        if (hero === null) return { x: 0, y: 0, seen: false };
        const seen: boolean = camera.project(hero.pos.x, ground(hero.pos.x, hero.pos.z) + RIVAL_PLAY.tagHeight, hero.pos.z, screen);
        return { x: screen.x, y: screen.y, seen };
      });
      lives.place(spots);
    },
    resign,
  };
}
