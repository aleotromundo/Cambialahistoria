import { cuesForUi, warmSoundIds } from '../sim/audio.ts';
import type { SoundCue } from '../sim/audio.ts';
import type { AudioDef, UiAction, ZoneAmbience } from '../sim/content/audio.ts';
import { loadAudio } from '../sim/content/audio.ts';
import type { Content, LineDef } from '../sim/content/types.ts';
import type { Vec2 } from '../sim/math.ts';
import type { World } from '../sim/world/types.ts';
import type { Bed, BedChange, Beds } from './audio/beds.ts';
import { createBeds, LOBBY_BED, playBedChange } from './audio/beds.ts';
import type { Listener } from './audio/listener.ts';
import { createListener, locateNear } from './audio/listener.ts';
import { readAssetBase } from './audio/manifest.ts';
import type { Placement } from './audio/mix.ts';
import { CENTRE } from './audio/mix.ts';
import type { AudioControls } from './audio/settings.ts';
import { browserSettingsStorage, createSettingsStore } from './audio/settings.ts';
import type { AudioSystem, StingerLocator, Trigger } from './audio/system.ts';
import { createAudioSystem } from './audio/system.ts';
import { unlockOnInput } from './audio/unlock.ts';
import { bookVoiceIds } from './opening/page-voice.ts';
import type { IsoCamera } from './render/iso-camera.ts';
import type { VoicePlayer } from './voice.ts';

export const GAME_AUDIO = {
  soundLogLength: 300,
  millisecondsPerSecond: 1000,
} as const;

export interface GameAudioDeps {
  readonly content: Content;
  readonly world: World;
  readonly camera: IsoCamera;
  readonly canvas: HTMLCanvasElement;
  readonly assetBase: unknown;
  readonly logSounds: boolean;
}

export interface GameAudio {
  readonly audioDef: AudioDef;
  readonly controls: AudioControls;
  readonly audio: AudioSystem;
  readonly sounds: Trigger[];
  readonly voice: VoicePlayer;
  readonly playCues: (cues: readonly SoundCue[]) => void;
  readonly playUi: (action: UiAction) => void;
  readonly startZoneAmbience: () => void;
  readonly lobbyBed: (shown: boolean) => void;
  readonly quietBeds: () => void;
  readonly hushBeds: () => void;
  readonly unlockAudio: () => void;
}

export function createGameAudio(deps: GameAudioDeps): GameAudio {
  const { content, world, camera, canvas } = deps;
  const audioDef: AudioDef = loadAudio(content);
  const controls: AudioControls = createSettingsStore(browserSettingsStorage());
  const audio: AudioSystem = createAudioSystem({
    base: readAssetBase(deps.assetBase),
    controls,
    random: Math.random,
    clock: (): number => performance.now() / GAME_AUDIO.millisecondsPerSecond,
  });
  audio.warm(warmSoundIds(audioDef), bookVoiceIds(content.books.values(), content.lines));
  const listener: Listener = createListener(camera, canvas, (): Vec2 => world.player.pos);
  const playCues = (cues: readonly SoundCue[]): void => {
    for (const cue of cues) {
      const place: Placement | null = cue.position === null ? CENTRE : listener(cue.position, cue.reach);
      if (place !== null) audio.play(cue, place);
    }
  };
  const playUi = (action: UiAction): void => playCues(cuesForUi(audioDef, action));
  const beds: Beds = createBeds((): number => performance.now() / GAME_AUDIO.millisecondsPerSecond);
  const locate: StingerLocator = locateNear(listener, (): World => world);
  const ambienceOf = (bed: Bed): ZoneAmbience | undefined => (bed.kind === 'lobby' ? audioDef.lobby : audioDef.ambience.get(bed.zone));
  const apply = (change: BedChange | null): void => playBedChange(audio, change, ambienceOf, locate);
  const startZoneAmbience = (): void => apply(beds.want({ kind: 'zone', zone: world.zone.id }));
  const lobbyBed = (shown: boolean): void => apply(shown ? beds.want(LOBBY_BED) : beds.hush());
  const quietBeds = (): void => apply(beds.want(null));
  const hushBeds = (): void => apply(beds.hush());
  const unlockAudio = (): void => {
    audio.unlock();
    apply(beds.unlock());
  };
  unlockOnInput(window, unlockAudio, (): boolean => audio.running);
  const sounds: Trigger[] = [];
  if (deps.logSounds) {
    audio.onTrigger((trigger: Trigger): void => {
      sounds.push(trigger);
      if (sounds.length > GAME_AUDIO.soundLogLength) sounds.shift();
    });
  }
  const voice: VoicePlayer = {
    play(line: LineDef): Promise<void> {
      return audio.playVoice(line.speaker, line.id).catch((): void => undefined);
    },
    stop(): void {
      audio.stopVoice();
    },
  };
  return { audioDef, controls, audio, sounds, voice, playCues, playUi, startZoneAmbience, lobbyBed, quietBeds, hushBeds, unlockAudio };
}
