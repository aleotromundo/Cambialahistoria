import type { PerspectiveCamera } from 'three';
import { Vector2 } from 'three';
import type { DuelSeat } from '../../sim/rl/duel.ts';
import type { PlayerState, World } from '../../sim/world/types.ts';
import type { IsoCamera } from '../render/iso-camera.ts';
import { CAMERA, liftAt } from '../render/iso-camera.ts';
import type { DuelFraming, DuelShot, FrameView, GroundHeight, GroundSpot } from './duel-frame.ts';
import { createDuelFraming, DUEL_FRAME, stepDuelFraming } from './duel-frame.ts';
import type { LifeRow } from './duel-lives.ts';
import { duelVerdict } from './duel-lives.ts';
import type { DuelLivesView, TagSpot } from './duel-lives-view.ts';
import { createDuelLivesView } from './duel-lives-view.ts';
import type { Watching } from './replay-watch.ts';
import { watchedSeats, watchLives } from './replay-watch.ts';

export const DUEL_WATCH = {
  tagHeight: 2.55,
} as const;

export interface DuelWatch {
  readonly captionHolder: HTMLElement;
  aim(dt: number): GroundSpot;
  show(): void;
}

function viewOf(lens: PerspectiveCamera, topCover: number): FrameView {
  return { aspect: lens.aspect, fovDegrees: lens.fov, yawDegrees: CAMERA.yawDegrees, pitchDegrees: CAMERA.pitchDegrees, lookHeight: CAMERA.lookHeight, topCover };
}

export interface DuelWatchDeps {
  readonly watching: Watching;
  readonly world: World;
  readonly camera: IsoCamera;
  readonly lens: PerspectiveCamera;
  readonly hud: HTMLElement;
  readonly pushFog: (by: number) => void;
}

export function createDuelWatch(deps: DuelWatchDeps): DuelWatch | null {
  const { watching, world, camera, lens, hud, pushFog }: DuelWatchDeps = deps;
  const seats: readonly DuelSeat[] | null = watchedSeats(watching);
  const first: DuelSeat | undefined = seats?.[0];
  const second: DuelSeat | undefined = seats?.[1];
  if (first === undefined || second === undefined) return null;
  const pair: readonly DuelSeat[] = [first, second];
  const framing: DuelFraming = createDuelFraming();
  const lives: DuelLivesView = createDuelLivesView(hud);
  const screen: Vector2 = new Vector2();
  const ground: GroundHeight = (x: number, z: number): number => liftAt(world.zone, x, z);
  return {
    captionHolder: lives.panel,
    aim: (dt: number): GroundSpot => {
      const shot: DuelShot = stepDuelFraming(framing, first.hero.pos, second.hero.pos, viewOf(lens, lives.cover()), ground, dt);
      camera.holdDistance(shot.distance);
      pushFog(shot.distance - DUEL_FRAME.nearest);
      return { x: shot.x, z: shot.z };
    },
    show: (): void => {
      const rows: LifeRow[] | null = watchLives(watching);
      if (rows === null) return;
      lives.show(rows, duelVerdict(rows));
      const spots: TagSpot[] = [];
      rows.forEach((row: LifeRow, index: number): void => {
        const hero: PlayerState | undefined = pair[index]?.hero;
        if (hero === undefined) return;
        const seen: boolean = camera.project(hero.pos.x, ground(hero.pos.x, hero.pos.z) + DUEL_WATCH.tagHeight, hero.pos.z, screen);
        spots[row.side] = { x: screen.x, y: screen.y, seen };
      });
      lives.place(spots);
    },
  };
}
