import { warnInConsole } from './backend/console-log.ts';
import type { PortalSdk, startPortalSdk as startQuiet } from './portal-sdk.ts';

export const CRAZYGAMES_SDK = {
  global: 'CrazyGames',
  environments: ['crazygames', 'local'],
} as const;

type GameCall = 'loadingStart' | 'loadingStop' | 'gameplayStart' | 'gameplayStop';

export interface CrazyGamesDeps {
  readonly root: unknown;
  readonly hidden: () => boolean;
  readonly warn: (message: string) => void;
}

function fieldOf(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

function playable(environment: unknown): boolean {
  return CRAZYGAMES_SDK.environments.some((name: string): boolean => name === environment);
}

function gameModule(sdk: object | null): object | null {
  const game: unknown = sdk === null ? null : Reflect.get(sdk, 'game');
  return typeof game === 'object' && game !== null ? game : null;
}

function startedSdk(root: unknown, warn: (message: string) => void): Promise<object | null> {
  const sdk: unknown = fieldOf(root, 'SDK');
  if (typeof sdk !== 'object' || sdk === null) return Promise.resolve(null);
  const init: unknown = Reflect.get(sdk, 'init');
  if (typeof init !== 'function') return Promise.resolve(null);
  return Promise.resolve()
    .then((): unknown => Reflect.apply(init, sdk, []))
    .then((): object | null => (playable(Reflect.get(sdk, 'environment')) ? sdk : null))
    .catch((error: unknown): null => {
      warn(`The CrazyGames SDK did not start: ${String(error)}`);
      return null;
    });
}

export function crazyGamesPortal(deps: CrazyGamesDeps): PortalSdk {
  const started: Promise<object | null> = startedSdk(deps.root, deps.warn);
  const send = (sdk: object | null, name: GameCall): boolean => {
    try {
      const game: object | null = gameModule(sdk);
      const method: unknown = game === null ? undefined : Reflect.get(game, name);
      if (game === null || typeof method !== 'function') return false;
      Reflect.apply(method, game, []);
      return true;
    } catch (error: unknown) {
      deps.warn(`The CrazyGames SDK refused ${name}: ${String(error)}`);
      return false;
    }
  };
  const call = (name: GameCall): void => {
    void started.then((sdk: object | null): boolean => send(sdk, name));
  };
  let loaded: boolean = false;
  let playing: boolean = false;
  const ready = (): void => {
    if (loaded) return;
    loaded = true;
    call('loadingStop');
  };
  call('loadingStart');
  return {
    paused: (): boolean => false,
    ready,
    gameplay: (active: boolean): void => {
      if (active === playing || deps.hidden()) return;
      if (active) ready();
      playing = active;
      call(active ? 'gameplayStart' : 'gameplayStop');
    },
  };
}

export const startPortalSdk: typeof startQuiet = (): Promise<PortalSdk> => Promise.resolve(crazyGamesPortal({ root: Reflect.get(globalThis, CRAZYGAMES_SDK.global), hidden: (): boolean => document.hidden, warn: warnInConsole }));
