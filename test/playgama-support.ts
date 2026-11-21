export interface FakeBridgeOptions {
  readonly initialize?: 'ok' | 'fail' | 'hang';
  readonly stored?: Readonly<Record<string, unknown>>;
}

export interface FakeSet {
  readonly keys: readonly unknown[];
  readonly values: readonly unknown[];
}

export interface FakeBridge {
  readonly raw: Readonly<Record<string, unknown>>;
  readonly modules: Readonly<Record<string, unknown>>;
  readonly started: () => boolean;
  readonly sent: string[];
  readonly gets: (readonly unknown[])[];
  readonly sets: FakeSet[];
  readonly stored: Map<string, unknown>;
  interstitials: number;
  failSets: boolean;
  hangSets: boolean;
  emit(event: string, value: unknown): void;
}

export const FAKE_EVENTS: Readonly<Record<string, string>> = {
  PAUSE_STATE_CHANGED: 'pause_state_changed',
  INTERSTITIAL_STATE_CHANGED: 'interstitial_state_changed',
};

function keyList(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) return [];
  const list: readonly unknown[] = value;
  return list;
}

export function createFakeBridge(options: FakeBridgeOptions = {}): FakeBridge {
  const listeners: Map<string, ((value: unknown) => void)[]> = new Map<string, ((value: unknown) => void)[]>();
  const on = (event: unknown, listener: unknown): void => {
    if (typeof event !== 'string' || typeof listener !== 'function') return;
    const list: ((value: unknown) => void)[] = listeners.get(event) ?? [];
    list.push((value: unknown): void => {
      Reflect.apply(listener, undefined, [value]);
    });
    listeners.set(event, list);
  };
  let initialized: boolean = false;
  const fake: FakeBridge = {
    raw: {},
    modules: {},
    started: (): boolean => initialized,
    sent: [],
    gets: [],
    sets: [],
    stored: new Map<string, unknown>(Object.entries(options.stored ?? {})),
    interstitials: 0,
    failSets: false,
    hangSets: false,
    emit(event: string, value: unknown): void {
      for (const listener of listeners.get(event) ?? []) listener(value);
    },
  };
  const modules: Readonly<Record<string, unknown>> = {
    EVENT_NAME: FAKE_EVENTS,
    platform: {
      sendMessage: (message: unknown): void => {
        if (typeof message === 'string') fake.sent.push(message);
      },
      on,
    },
    advertisement: {
      showInterstitial: (): void => {
        fake.interstitials += 1;
      },
      on,
    },
    storage: {
      get: (keys: unknown): Promise<readonly unknown[]> => {
        const list: readonly unknown[] = keyList(keys);
        fake.gets.push(list);
        return Promise.resolve(list.map((key: unknown): unknown => (typeof key === 'string' ? (fake.stored.get(key) ?? null) : null)));
      },
      set: (keys: unknown, values: unknown): Promise<void> => {
        const names: readonly unknown[] = keyList(keys);
        const texts: readonly unknown[] = keyList(values);
        fake.sets.push({ keys: names, values: texts });
        if (fake.failSets) return Promise.reject(new Error('quota'));
        if (fake.hangSets) return new Promise<void>((): void => undefined);
        names.forEach((key: unknown, index: number): void => {
          if (typeof key === 'string') fake.stored.set(key, texts[index]);
        });
        return Promise.resolve();
      },
    },
  };
  const raw: Readonly<Record<string, unknown>> = {
    initialize: (): Promise<void> => {
      if (options.initialize === 'fail') return Promise.reject(new Error('no platform'));
      if (options.initialize === 'hang') return new Promise<void>((): void => undefined);
      initialized = true;
      return Promise.resolve();
    },
    get EVENT_NAME(): unknown {
      return modules['EVENT_NAME'];
    },
    get platform(): unknown {
      return initialized ? modules['platform'] : undefined;
    },
    get storage(): unknown {
      return initialized ? modules['storage'] : undefined;
    },
    get advertisement(): unknown {
      return initialized ? modules['advertisement'] : undefined;
    },
  };
  return Object.assign(fake, { raw, modules });
}
