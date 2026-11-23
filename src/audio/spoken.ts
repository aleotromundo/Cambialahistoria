import type { Placement } from './mix.ts';

export const SPOKEN = {
  graceSeconds: 1,
  msPerSecond: 1000,
} as const;

export interface SpokenParts {
  readonly context: AudioContext;
  readonly bus: AudioNode;
  readonly gainOf: (buffer: AudioBuffer) => number;
  readonly duck: (delta: number) => void;
}

export function placedGain(base: number, place: Placement): number {
  return base * place.gain;
}

export async function playPlaced(parts: SpokenParts, audio: ArrayBuffer, place: Placement): Promise<void> {
  let buffer: AudioBuffer;
  try {
    buffer = await parts.context.decodeAudioData(audio.slice(0));
  } catch {
    return;
  }
  if (parts.context.state !== 'running') return;
  const level: GainNode = parts.context.createGain();
  level.gain.value = placedGain(parts.gainOf(buffer), place);
  const pan: StereoPannerNode = parts.context.createStereoPanner();
  pan.pan.value = place.pan;
  level.connect(pan);
  pan.connect(parts.bus);
  const source: AudioBufferSourceNode = parts.context.createBufferSource();
  source.buffer = buffer;
  source.connect(level);
  parts.duck(1);
  await new Promise<void>((resolve: () => void): void => {
    let done: boolean = false;
    let started: boolean = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      window.clearTimeout(guard);
      parts.duck(-1);
      if (started) source.stop();
      source.disconnect();
      level.disconnect();
      pan.disconnect();
      resolve();
    };
    const guard: number = window.setTimeout(finish, (buffer.duration + SPOKEN.graceSeconds) * SPOKEN.msPerSecond);
    source.addEventListener('ended', finish);
    try {
      source.start();
      started = true;
    } catch {
      finish();
    }
  });
}
