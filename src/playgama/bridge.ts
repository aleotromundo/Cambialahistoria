export const BRIDGE = {
  script: 'https://bridge.playgama.com/v2/stable/playgama-bridge.js',
  config: 'playgama-bridge-config.json',
  global: 'bridge',
  events: { pause: 'PAUSE_STATE_CHANGED', interstitial: 'INTERSTITIAL_STATE_CHANGED' },
  ready: 'game_ready',
} as const;

export type InterstitialState = 'loading' | 'opened' | 'closed' | 'failed';

const INTERSTITIAL_STATES: readonly InterstitialState[] = ['loading', 'opened', 'closed', 'failed'];

export interface Bridge {
  sendMessage(message: string): void;
  showInterstitial(): void;
  storageGet(keys: readonly string[]): Promise<readonly unknown[]>;
  storageSet(keys: readonly string[], values: readonly string[]): Promise<void>;
  onPause(listener: (paused: boolean) => void): void;
  onInterstitial(listener: (state: InterstitialState) => void): void;
}

function part(owner: unknown, name: string): object | null {
  if (typeof owner !== 'object' || owner === null) return null;
  const found: unknown = Reflect.get(owner, name);
  return typeof found === 'object' && found !== null ? found : null;
}

function callable(owner: object | null, name: string): boolean {
  return owner !== null && typeof Reflect.get(owner, name) === 'function';
}

function invoke(owner: object, name: string, args: readonly unknown[]): unknown {
  const found: unknown = Reflect.get(owner, name);
  if (typeof found !== 'function') throw new TypeError(`the bridge has no ${name}`);
  const result: unknown = Reflect.apply(found, owner, args);
  return result;
}

function settled(value: unknown): Promise<unknown> {
  return Promise.resolve(value).then((done: unknown): unknown => done);
}

function eventName(names: object | null, key: string): string | null {
  if (names === null) return null;
  const found: unknown = Reflect.get(names, key);
  return typeof found === 'string' ? found : null;
}

function readList(value: unknown, length: number): readonly unknown[] {
  if (Array.isArray(value)) {
    const list: readonly unknown[] = value;
    return list;
  }
  return length === 1 ? [value] : [];
}

function interstitialState(value: unknown): InterstitialState | null {
  return INTERSTITIAL_STATES.find((state: InterstitialState): boolean => state === value) ?? null;
}

function listen(owner: object, event: string | null, listener: (value: unknown) => void): void {
  if (event === null || !callable(owner, 'on')) return;
  invoke(owner, 'on', [event, listener]);
}

function rootOf(value: unknown): object | null {
  return typeof value === 'object' && value !== null ? value : null;
}

export async function startBridge(value: unknown): Promise<Bridge | null> {
  const root: object | null = rootOf(value);
  if (root === null || !callable(root, 'initialize')) return null;
  await settled(invoke(root, 'initialize', []));
  return readBridge(root);
}

export function readBridge(value: unknown): Bridge | null {
  const root: object | null = rootOf(value);
  const platform: object | null = part(root, 'platform');
  const storage: object | null = part(root, 'storage');
  const advertisement: object | null = part(root, 'advertisement');
  const names: object | null = part(root, 'EVENT_NAME');
  if (root === null || platform === null || storage === null || advertisement === null) return null;
  if (!callable(platform, 'sendMessage') || !callable(storage, 'get') || !callable(storage, 'set') || !callable(advertisement, 'showInterstitial')) return null;
  return {
    sendMessage(message: string): void {
      invoke(platform, 'sendMessage', [message]);
    },
    showInterstitial(): void {
      invoke(advertisement, 'showInterstitial', []);
    },
    storageGet: (keys: readonly string[]): Promise<readonly unknown[]> => settled(invoke(storage, 'get', [[...keys]])).then((found: unknown): readonly unknown[] => readList(found, keys.length)),
    storageSet: (keys: readonly string[], values: readonly string[]): Promise<void> => settled(invoke(storage, 'set', [[...keys], [...values]])).then((): void => undefined),
    onPause(listener: (paused: boolean) => void): void {
      listen(platform, eventName(names, BRIDGE.events.pause), (paused: unknown): void => {
        if (typeof paused === 'boolean') listener(paused);
      });
    },
    onInterstitial(listener: (state: InterstitialState) => void): void {
      listen(advertisement, eventName(names, BRIDGE.events.interstitial), (state: unknown): void => {
        const known: InterstitialState | null = interstitialState(state);
        if (known !== null) listener(known);
      });
    },
  };
}
