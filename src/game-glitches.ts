import type { AudioDef } from '../sim/content/audio.ts';
import type { Content } from '../sim/content/types.ts';
import type { Command, World } from '../sim/world/types.ts';
import type { AudioSystem } from './audio/system.ts';
import { element } from './dom-element.ts';
import type { GlitchSettingsStore } from './glitch/glitch-settings.ts';
import type { GlitchView } from './glitch/glitch-view.ts';
import { createGlitchView } from './glitch/glitch-view.ts';
import { createSeamAudio } from './glitch/seam-audio.ts';
import type { QualityName } from './mobile/quality.ts';
import type { Actors } from './render/actors.ts';
import { REDUCED_MOTION } from './render/effect-kit.ts';
import type { SeamPass } from './render/seam-pass.ts';
import { createSeamPass } from './render/seam-pass.ts';
import type { Stage } from './render/stage.ts';
import type { VoicePlayer } from './voice.ts';

export interface GameGlitchesDeps {
  readonly world: World;
  readonly content: Content;
  readonly stage: Stage;
  readonly quality: QualityName;
  readonly glitchSettings: GlitchSettingsStore;
  readonly audio: AudioSystem;
  readonly audioDef: AudioDef;
  readonly actors: Actors;
  readonly voice: VoicePlayer;
  readonly send: (command: Command) => void;
  readonly relight: () => void;
  readonly startZoneAmbience: () => void;
  readonly hushBeds: () => void;
}

export function startGameGlitches(deps: GameGlitchesDeps): GlitchView {
  const { world, content, stage, audio, audioDef, actors, voice, send, startZoneAmbience, hushBeds } = deps;
  const seamPass: SeamPass = createSeamPass();
  stage.setSeam(seamPass.pass);
  return createGlitchView({
    world,
    scene: stage.scene,
    app: element('hud', HTMLDivElement),
    mistZone: content.zones.get(world.glitch.def.mistZone) ?? world.zone,
    quality: deps.quality,
    settings: deps.glitchSettings,
    overlays: element('overlays', HTMLDivElement),
    seamPass,
    seamAudio: createSeamAudio(audio, audioDef.seam, world.glitch.def.seam),
    reducedMotion: (): boolean => window.matchMedia(REDUCED_MOTION).matches,
    hero: () => actors.hero(),
    send,
    setAmbience: (ambience): void => stage.setAmbience(ambience),
    restoreAmbience: (): void => { stage.setAmbience(world.zone.ambience); deps.relight(); },
    silence: (): void => {
      hushBeds();
      voice.stop();
    },
    resume: (): void => startZoneAmbience(),
  });
}
