import type { Timers } from './backend/backend.ts';
import { createBrowserTimers } from './browser-timers.ts';
import type { PortalSdk, startPortalSdk as startQuiet } from './portal-sdk.ts';

export const YANDEX_SDK = {
  script: '/sdk.js',
  global: 'YaGames',
  initMs: 6000,
  languages: ['en'],
  fallbackLanguage: 'en',
  pauseEvent: 'game_api_pause',
  resumeEvent: 'game_api_resume',
} as const;

type Call = (...args: readonly unknown[]) => unknown;

export interface YandexHooks {
  readonly lang: string | null;
  readonly ready: Call | null;
  readonly start: Call | null;
  readonly stop: Call | null;
  readonly on: Call | null;
}

export interface YandexDeps {
  readonly load: () => Promise<unknown>;
  readonly timers: Timers;
  readonly setLanguage: (lang: string) => void;
}

export interface GameplayEdge {
  readonly sent: boolean;
  readonly beforePause: boolean;
  readonly paused: boolean;
}

export type GameplaySignal = 'start' | 'stop' | 'none';

export interface GameplayStep {
  readonly edge: GameplayEdge;
  readonly signal: GameplaySignal;
}

export const GAMEPLAY_IDLE: GameplayEdge = { sent: false, beforePause: false, paused: false };

export const NO_HOOKS: YandexHooks = { lang: null, ready: null, start: null, stop: null, on: null };

export function gameplayStep(edge: GameplayEdge, active: boolean): GameplayStep {
  if (edge.paused || active === edge.sent) return { edge, signal: 'none' };
  return { edge: { ...edge, sent: active }, signal: active ? 'start' : 'stop' };
}

export function pausedEdge(edge: GameplayEdge): GameplayEdge {
  if (edge.paused) return edge;
  return { sent: false, beforePause: edge.sent, paused: true };
}

export function resumedEdge(edge: GameplayEdge): GameplayEdge {
  if (!edge.paused) return edge;
  return { sent: edge.beforePause, beforePause: false, paused: false };
}

export function pickLanguage(lang: string | null, offered: readonly string[], fallback: string): string {
  const primary: string = (lang ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return offered.includes(primary) ? primary : fallback;
}

function field(target: unknown, name: string): unknown {
  return typeof target === 'object' && target !== null ? Reflect.get(target, name) : undefined;
}

function method(target: unknown, name: string): Call | null {
  const found: unknown = field(target, name);
  if (typeof found !== 'function') return null;
  return (...args: readonly unknown[]): unknown => {
    try {
      return Reflect.apply(found, target, args);
    } catch {
      return undefined;
    }
  };
}

export function readYandexHooks(sdk: unknown): YandexHooks {
  const features: unknown = field(sdk, 'features');
  const loading: unknown = field(features, 'LoadingAPI');
  const gameplay: unknown = field(features, 'GameplayAPI');
  const lang: unknown = field(field(field(sdk, 'environment'), 'i18n'), 'lang');
  return {
    lang: typeof lang === 'string' ? lang : null,
    ready: method(loading, 'ready'),
    start: method(gameplay, 'start'),
    stop: method(gameplay, 'stop'),
    on: method(sdk, 'on'),
  };
}

export interface YandexPortal extends PortalSdk {
  attach(hooks: YandexHooks): void;
}

export function yandexPortal(): YandexPortal {
  let hooks: YandexHooks = NO_HOOKS;
  let attached: boolean = false;
  let edge: GameplayEdge = GAMEPLAY_IDLE;
  let readyAsked: boolean = false;
  let readySent: boolean = false;
  const sendReady = (): void => {
    if (!readyAsked || readySent || hooks.ready === null) return;
    readySent = true;
    hooks.ready();
  };
  return {
    attach: (next: YandexHooks): void => {
      if (attached) return;
      attached = true;
      hooks = next;
      edge = GAMEPLAY_IDLE;
      next.on?.(YANDEX_SDK.pauseEvent, (): void => {
        edge = pausedEdge(edge);
      });
      next.on?.(YANDEX_SDK.resumeEvent, (): void => {
        edge = resumedEdge(edge);
      });
      sendReady();
    },
    paused: (): boolean => edge.paused,
    ready: (): void => {
      readyAsked = true;
      sendReady();
    },
    gameplay: (active: boolean): void => {
      const step: GameplayStep = gameplayStep(edge, active);
      edge = step.edge;
      switch (step.signal) {
        case 'start':
          hooks.start?.();
          return;
        case 'stop':
          hooks.stop?.();
          return;
        case 'none':
          return;
      }
    },
  };
}

async function inTime<T>(timers: Timers, ms: number, work: Promise<T>, late: T): Promise<T> {
  const timer: { cancel: (() => void) | null } = { cancel: null };
  const expired: Promise<T> = new Promise<T>((resolve: (value: T) => void): void => {
    timer.cancel = timers.after(ms, (): void => resolve(late));
  });
  try {
    return await Promise.race([work.catch((): T => late), expired]);
  } finally {
    timer.cancel?.();
  }
}

async function initSdk(load: () => Promise<unknown>): Promise<unknown> {
  const init: Call | null = method(await load(), 'init');
  if (init === null) throw new Error('the Yandex Games SDK has no init');
  const sdk: unknown = await init();
  return sdk;
}

export async function startYandexSdk(deps: YandexDeps): Promise<PortalSdk> {
  const portal: YandexPortal = yandexPortal();
  const arrived: Promise<boolean> = initSdk(deps.load)
    .then((sdk: unknown): boolean => {
      const hooks: YandexHooks = readYandexHooks(sdk);
      deps.setLanguage(pickLanguage(hooks.lang, YANDEX_SDK.languages, YANDEX_SDK.fallbackLanguage));
      portal.attach(hooks);
      return true;
    })
    .catch((): boolean => false);
  const inTimeArrived: boolean = await inTime<boolean>(deps.timers, YANDEX_SDK.initMs, arrived, false);
  if (!inTimeArrived) deps.setLanguage(YANDEX_SDK.fallbackLanguage);
  return portal;
}

function loadScript(): Promise<unknown> {
  return new Promise<unknown>((resolve: (value: unknown) => void, reject: (reason: Error) => void): void => {
    const script: HTMLScriptElement = document.createElement('script');
    script.src = YANDEX_SDK.script;
    script.async = true;
    script.addEventListener('load', (): void => resolve(Reflect.get(window, YANDEX_SDK.global)));
    script.addEventListener('error', (): void => reject(new Error('the Yandex Games SDK did not load')));
    document.head.append(script);
  });
}

export const startPortalSdk: typeof startQuiet = (): Promise<PortalSdk> =>
  startYandexSdk({
    load: loadScript,
    timers: createBrowserTimers(),
    setLanguage: (lang: string): void => {
      document.documentElement.lang = lang;
    },
  });
