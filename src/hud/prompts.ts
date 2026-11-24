export type Gesture = 'use' | 'alternate';

export interface Prompt {
  readonly gesture: Gesture;
  readonly does: string;
  readonly key: string | null;
}

export interface DeviceWords {
  readonly gestures: Readonly<Record<Gesture, string | null>>;
  readonly join: string;
}

export const PROMPT_WORDS: Readonly<Record<'desk' | 'touch', DeviceWords>> = {
  desk: { gestures: { use: 'Haz clic', alternate: 'Haz clic derecho' }, join: ' · ' },
  touch: { gestures: { use: 'Toca', alternate: null }, join: ' · ' },
};

export function use(does: string, key: string | null = null): Prompt {
  return { gesture: 'use', does, key };
}

export function alternate(does: string): Prompt {
  return { gesture: 'alternate', does, key: null };
}

export function deviceWords(touch: boolean): DeviceWords {
  return touch ? PROMPT_WORDS.touch : PROMPT_WORDS.desk;
}

export function promptText(touch: boolean, ...prompts: readonly Prompt[]): string {
  const words: DeviceWords = deviceWords(touch);
  return prompts
    .flatMap((prompt: Prompt): string[] => {
      const verb: string | null = words.gestures[prompt.gesture];
      if (verb === null) return [];
      return [touch || prompt.key === null ? `${verb} para ${prompt.does}` : `${verb} o presiona ${prompt.key} para ${prompt.does}`];
    })
    .join(words.join);
}

export function openWith(touch: boolean, panel: string, key: string): string {
  const names: Readonly<Record<string, string>> = { map: 'mapa', 'skill tree': 'árbol de habilidades', inventory: 'inventario', character: 'personaje' };
  const name: string = names[panel] ?? panel;
  return touch ? `Abre el ${name} desde la barra superior` : `Abre el ${name} con ${key}`;
}
