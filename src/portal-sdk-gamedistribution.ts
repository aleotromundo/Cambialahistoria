import type { Timers } from './backend/backend.ts';
import { createBrowserTimers } from './browser-timers.ts';
import type { AdMoment, PortalSdk, startPortalSdk as startQuiet } from './portal-sdk.ts';

export interface GdSettings {
  readonly gameId: string;
  readonly sdkUrl: string;
  readonly scriptId: string;
  readonly readyWaitMs: number;
  readonly adLongestMs: number;
  readonly breakGapMs: number;
}

export const GD_SDK: GdSettings = {
  gameId: '',
  sdkUrl: 'https://html5.api.gamedistribution.com/main.min.js',
  scriptId: 'gamedistribution-jssdk',
  readyWaitMs: 3000,
  adLongestMs: 60_000,
  breakGapMs: 180_000,
};

export const GD_GAME_ID: RegExp = /^[0-9a-f]{32}$/;

export interface GdOptions {
  readonly gameId: string;
  readonly onEvent: (event: unknown) => void;
}

export interface GdPage {
  readonly timers: Timers;
  install(options: GdOptions): void;
  sdk(): unknown;
  now(): number;
}

export function eventName(event: unknown): string | null {
  if (typeof event !== 'object' || event === null || !('name' in event)) return null;
  return typeof event.name === 'string' ? event.name : null;
}

function showAdOf(sdk: unknown): (() => unknown) | null {
  if (typeof sdk !== 'object' || sdk === null || !('showAd' in sdk)) return null;
  const showAd: unknown = sdk.showAd;
  if (typeof showAd !== 'function') return null;
  return (): unknown => {
    const shown: unknown = Reflect.apply(showAd, sdk, []);
    return shown;
  };
}

function within(work: Promise<unknown>, ms: number, timers: Timers): Promise<void> {
  let cancel: (() => void) | null = null;
  const timeout: Promise<void> = new Promise<void>((resolve: () => void): void => {
    cancel = timers.after(ms, resolve);
  });
  const settled: Promise<void> = work.then(
    (): undefined => undefined,
    (): undefined => undefined,
  );
  return Promise.race([settled, timeout]).finally((): void => {
    cancel?.();
  });
}

export function createGdSdk(page: GdPage, settings: GdSettings): PortalSdk {
  let ready: boolean = false;
  let paused: boolean = false;
  let lastBreak: number | null = null;
  let running: Promise<void> | null = null;
  const readyWaiters: Map<() => void, () => void> = new Map<() => void, () => void>();

  const untilReady = (): Promise<boolean> => {
    if (ready) return Promise.resolve(true);
    return new Promise<boolean>((resolve: (value: boolean) => void): void => {
      const waiter = (): void => {
        resolve(true);
      };
      readyWaiters.set(
        waiter,
        page.timers.after(settings.readyWaitMs, (): void => {
          readyWaiters.delete(waiter);
          resolve(false);
        }),
      );
    });
  };

  const onEvent = (event: unknown): void => {
    switch (eventName(event) ?? '') {
      case 'SDK_READY':
        ready = true;
        for (const [waiter, cancel] of readyWaiters) {
          cancel();
          waiter();
        }
        readyWaiters.clear();
        break;
      case 'SDK_GAME_PAUSE':
        paused = true;
        break;
      case 'SDK_GAME_START':
        paused = false;
        break;
      default:
        break;
    }
  };

  const resumeGame = (): void => {
    paused = false;
  };

  const show = async (): Promise<void> => {
    if (!(await untilReady())) return;
    const showAd: (() => unknown) | null = showAdOf(page.sdk());
    if (showAd === null) return;
    lastBreak = page.now();
    const shown: Promise<unknown> = new Promise<unknown>((resolve: (value: unknown) => void): void => {
      resolve(showAd());
    });
    void shown.then(resumeGame, resumeGame);
    await within(shown, settings.adLongestMs, page.timers);
  };

  const quiet: PortalSdk = { paused: (): boolean => paused, ready: (): void => undefined, gameplay: (): void => undefined };
  if (settings.gameId === '') return quiet;
  page.install({ gameId: settings.gameId, onEvent });
  const adBreak = (moment: AdMoment): Promise<void> => {
    if (running !== null) return running;
    if (moment !== 'start' && lastBreak !== null && page.now() - lastBreak < settings.breakGapMs) return Promise.resolve();
    const current: Promise<void> = show().finally((): void => {
      running = null;
    });
    running = current;
    return current;
  };
  return { ...quiet, adBreak };
}

function browserPage(settings: GdSettings): GdPage {
  return {
    timers: createBrowserTimers(),
    install(options: GdOptions): void {
      Reflect.set(window, 'GD_OPTIONS', options);
      if (document.getElementById(settings.scriptId) !== null) return;
      const script: HTMLScriptElement = document.createElement('script');
      script.id = settings.scriptId;
      script.src = settings.sdkUrl;
      script.async = true;
      document.head.append(script);
    },
    sdk(): unknown {
      const sdk: unknown = Reflect.get(window, 'gdsdk');
      return sdk;
    },
    now: (): number => performance.now(),
  };
}

export const startPortalSdk: typeof startQuiet = (): Promise<PortalSdk> => Promise.resolve(createGdSdk(browserPage(GD_SDK), GD_SDK));
