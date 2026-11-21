import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeClock, createFakeTimers, settle } from '../test/backend-support.ts';
import type { FakeTimers } from '../test/backend-support.ts';
import { GAMEPLAY_IDLE, YANDEX_SDK, gameplayStep, pausedEdge, pickLanguage, readYandexHooks, resumedEdge, startYandexSdk, yandexPortal } from './portal-sdk-yandex.ts';
import type { GameplayEdge, YandexHooks, YandexPortal } from './portal-sdk-yandex.ts';
import type { PortalSdk } from './portal-sdk.ts';

interface FakeYandex {
  readonly calls: string[];
  readonly listeners: Map<string, () => void>;
  readonly sdk: object;
}

function fakeYandex(lang: string): FakeYandex {
  const calls: string[] = [];
  const listeners: Map<string, () => void> = new Map<string, () => void>();
  const sdk: object = {
    environment: { i18n: { lang } },
    features: {
      LoadingAPI: { ready: (): void => void calls.push('ready') },
      GameplayAPI: { start: (): void => void calls.push('start'), stop: (): void => void calls.push('stop') },
    },
    on(event: string, listener: () => void): void {
      listeners.set(event, listener);
    },
  };
  return { calls, listeners, sdk };
}

function fire(fake: FakeYandex, event: string): void {
  const listener: (() => void) | undefined = fake.listeners.get(event);
  assert.ok(listener !== undefined, `no listener for ${event}`);
  listener();
}

void test('the language comes from the SDK and falls back to English for one the game does not ship', (): void => {
  assert.equal(pickLanguage('en', ['en'], 'en'), 'en');
  assert.equal(pickLanguage('EN-us', ['en'], 'en'), 'en');
  assert.equal(pickLanguage('ru', ['en'], 'en'), 'en');
  assert.equal(pickLanguage('ru', ['en', 'ru'], 'en'), 'ru');
  assert.equal(pickLanguage(null, ['en'], 'en'), 'en');
  assert.equal(pickLanguage('', ['en'], 'en'), 'en');
});

void test('gameplay start and stop are sent only when active play changes', (): void => {
  let edge: GameplayEdge = GAMEPLAY_IDLE;
  const signals: string[] = [];
  for (const active of [false, true, true, false, false, true]) {
    const step = gameplayStep(edge, active);
    edge = step.edge;
    signals.push(step.signal);
  }
  assert.deepEqual(signals, ['none', 'start', 'none', 'stop', 'none', 'start']);
});

void test('a platform pause stops play without a second stop, and its resume restarts only play that was running', (): void => {
  const running: GameplayEdge = gameplayStep(GAMEPLAY_IDLE, true).edge;
  const paused: GameplayEdge = pausedEdge(running);
  assert.equal(paused.paused, true);
  assert.equal(gameplayStep(paused, false).signal, 'none');
  assert.equal(gameplayStep(paused, true).signal, 'none');
  const resumed: GameplayEdge = resumedEdge(paused);
  assert.equal(resumed.paused, false);
  assert.equal(gameplayStep(resumed, true).signal, 'none');
  assert.equal(gameplayStep(resumed, false).signal, 'stop');
  const fromMenu: GameplayEdge = resumedEdge(pausedEdge(GAMEPLAY_IDLE));
  assert.equal(gameplayStep(fromMenu, true).signal, 'start');
  assert.equal(pausedEdge(paused), paused);
  assert.equal(resumedEdge(running), running);
});

void test('the SDK hooks are read without trusting the object, and a missing feature is left out', (): void => {
  const hooks: YandexHooks = readYandexHooks({ environment: { i18n: { lang: 'tr' } }, features: {} });
  assert.equal(hooks.lang, 'tr');
  assert.equal(hooks.ready, null);
  assert.equal(hooks.start, null);
  assert.equal(hooks.on, null);
  assert.deepEqual(readYandexHooks(null), { lang: null, ready: null, start: null, stop: null, on: null });
  assert.deepEqual(readYandexHooks({ environment: { i18n: { lang: 3 } }, features: { LoadingAPI: { ready: 'no' } } }), { lang: null, ready: null, start: null, stop: null, on: null });
});

void test('a hook that throws is absorbed so the game runs on', (): void => {
  const sdk: YandexPortal = yandexPortal();
  sdk.attach(readYandexHooks({ features: { LoadingAPI: { ready: (): never => { throw new Error('sdk broke'); } } } }));
  assert.doesNotThrow((): void => sdk.ready());
});

void test('the Yandex build tells the platform once that it is ready, and reports play to it across an ad pause', async (): Promise<void> => {
  const fake: FakeYandex = fakeYandex('en');
  const timers: FakeTimers = createFakeTimers(createFakeClock());
  const languages: string[] = [];
  const sdk: PortalSdk = await startYandexSdk({ load: (): Promise<unknown> => Promise.resolve({ init: (): Promise<object> => Promise.resolve(fake.sdk) }), timers: timers.timers, setLanguage: (lang: string): void => void languages.push(lang) });
  assert.deepEqual(languages, ['en']);
  assert.equal(timers.pending(), 0);
  sdk.ready();
  sdk.ready();
  sdk.gameplay(true);
  sdk.gameplay(true);
  fire(fake, YANDEX_SDK.pauseEvent);
  assert.equal(sdk.paused(), true);
  sdk.gameplay(false);
  fire(fake, YANDEX_SDK.resumeEvent);
  assert.equal(sdk.paused(), false);
  sdk.gameplay(true);
  sdk.gameplay(false);
  assert.deepEqual(fake.calls, ['ready', 'start', 'stop']);
});

void test('with no SDK script the game starts anyway in English and never pauses', async (): Promise<void> => {
  const timers: FakeTimers = createFakeTimers(createFakeClock());
  const languages: string[] = [];
  const sdk: PortalSdk = await startYandexSdk({ load: (): Promise<unknown> => Promise.reject(new Error('no script')), timers: timers.timers, setLanguage: (lang: string): void => void languages.push(lang) });
  assert.deepEqual(languages, [YANDEX_SDK.fallbackLanguage]);
  assert.equal(sdk.paused(), false);
  assert.doesNotThrow((): void => {
    sdk.ready();
    sdk.gameplay(true);
  });
});

void test('an SDK that never finishes its init is given up on after its time', async (): Promise<void> => {
  const timers: FakeTimers = createFakeTimers(createFakeClock());
  let started: PortalSdk | null = null;
  void startYandexSdk({ load: (): Promise<unknown> => Promise.resolve({ init: (): Promise<never> => new Promise<never>((): void => undefined) }), timers: timers.timers, setLanguage: (): void => undefined }).then((sdk: PortalSdk): PortalSdk => {
    started = sdk;
    return sdk;
  });
  await settle();
  assert.equal(started, null);
  await timers.advance(YANDEX_SDK.initMs);
  assert.notEqual(started, null);
});

void test('an SDK that arrives after the game gave up on it still gets the ready call, the pause listeners and a start', async (): Promise<void> => {
  const fake: FakeYandex = fakeYandex('en');
  const timers: FakeTimers = createFakeTimers(createFakeClock());
  const languages: string[] = [];
  const arrival: { arrive: ((sdk: object) => void) | null } = { arrive: null };
  const late: Promise<object> = new Promise<object>((resolve: (sdk: object) => void): void => {
    arrival.arrive = resolve;
  });
  const starting: Promise<PortalSdk> = startYandexSdk({ load: (): Promise<unknown> => Promise.resolve({ init: (): Promise<object> => late }), timers: timers.timers, setLanguage: (lang: string): void => void languages.push(lang) });
  await timers.advance(YANDEX_SDK.initMs);
  const sdk: PortalSdk = await starting;
  sdk.ready();
  sdk.gameplay(true);
  assert.deepEqual(fake.calls, []);
  arrival.arrive?.(fake.sdk);
  await settle();
  assert.deepEqual(fake.calls, ['ready']);
  sdk.gameplay(true);
  assert.deepEqual(fake.calls, ['ready', 'start']);
  fire(fake, YANDEX_SDK.pauseEvent);
  assert.equal(sdk.paused(), true);
  assert.deepEqual(languages, [YANDEX_SDK.fallbackLanguage, 'en']);
});
