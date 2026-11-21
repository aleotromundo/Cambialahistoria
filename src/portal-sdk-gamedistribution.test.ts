import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeClock, createFakeTimers, settle } from '../test/backend-support.ts';
import type { FakeClock, FakeTimers } from '../test/backend-support.ts';
import { GD_GAME_ID, GD_SDK, createGdSdk, eventName } from './portal-sdk-gamedistribution.ts';
import type { GdOptions, GdPage, GdSettings } from './portal-sdk-gamedistribution.ts';
import type { AdMoment, PortalSdk } from './portal-sdk.ts';

const GAME_ID: string = '0123456789abcdef0123456789abcdef';
const SETTINGS: GdSettings = { ...GD_SDK, gameId: GAME_ID };

interface Tracked {
  done: boolean;
}

function breaks(sdk: PortalSdk): (moment: AdMoment) => Promise<void> {
  const adBreak: ((moment: AdMoment) => Promise<void>) | undefined = sdk.adBreak;
  if (adBreak === undefined) throw new Error('this SDK takes no ad breaks');
  return adBreak;
}

function track(work: Promise<void>): Tracked {
  const tracked: Tracked = { done: false };
  void work.then((): Tracked => {
    tracked.done = true;
    return tracked;
  });
  return tracked;
}

interface FakeGd {
  readonly page: GdPage;
  readonly clock: FakeClock;
  readonly timers: FakeTimers;
  readonly installed: GdOptions[];
  shows: number;
  sdk: unknown;
  emit(name: string): void;
  finishAd(): void;
}

function fakeGd(): FakeGd {
  const clock: FakeClock = createFakeClock();
  const timers: FakeTimers = createFakeTimers(clock);
  let finish: (() => void) | null = null;
  const gd: FakeGd = {
    clock,
    timers,
    installed: [],
    shows: 0,
    sdk: null,
    page: {
      timers: timers.timers,
      install: (options: GdOptions): void => {
        gd.installed.push(options);
      },
      sdk: (): unknown => gd.sdk,
      now: (): number => clock.now,
    },
    emit(name: string): void {
      for (const options of gd.installed) options.onEvent({ name, message: name, status: 'success' });
    },
    finishAd(): void {
      finish?.();
    },
  };
  gd.sdk = {
    showAd: (): Promise<void> => {
      gd.shows += 1;
      gd.emit('SDK_GAME_PAUSE');
      return new Promise<void>((resolve: () => void): void => {
        finish = (): void => {
          gd.emit('SDK_GAME_START');
          resolve();
        };
      });
    },
  };
  return gd;
}

void test('the settings name the SDK script GameDistribution documents and wait a bounded time', (): void => {
  assert.equal(GD_SDK.sdkUrl, 'https://html5.api.gamedistribution.com/main.min.js');
  assert.equal(GD_SDK.scriptId, 'gamedistribution-jssdk');
  assert.ok(GD_SDK.gameId === '' || GD_GAME_ID.test(GD_SDK.gameId), 'the game id is empty or the 32-character hash from the dashboard');
  assert.ok(GD_SDK.readyWaitMs > 0 && GD_SDK.adLongestMs > GD_SDK.readyWaitMs && GD_SDK.breakGapMs > 0);
});

void test('an event name is read only from an object that has one', (): void => {
  assert.equal(eventName({ name: 'SDK_READY' }), 'SDK_READY');
  assert.equal(eventName({ name: 3 }), null);
  assert.equal(eventName('SDK_READY'), null);
  assert.equal(eventName(null), null);
});

void test('with no game id filled in the SDK is never loaded and no ad is asked for', (): void => {
  const gd: FakeGd = fakeGd();
  const sdk: PortalSdk = createGdSdk(gd.page, { ...GD_SDK, gameId: '' });
  assert.equal(sdk.adBreak, undefined);
  assert.deepEqual(gd.installed, []);
  assert.equal(gd.shows, 0);
  assert.equal(sdk.paused(), false);
});

void test('the SDK is installed once with the game id, and the game pauses for an ad and moves again after it', async (): Promise<void> => {
  const gd: FakeGd = fakeGd();
  const sdk: PortalSdk = createGdSdk(gd.page, SETTINGS);
  assert.notEqual(sdk.adBreak, undefined);
  assert.equal(gd.installed.length, 1);
  assert.equal(gd.installed[0]?.gameId, GAME_ID);
  gd.emit('SDK_READY');
  const run: Tracked = track(breaks(sdk)('start'));
  await settle();
  assert.equal(gd.shows, 1);
  assert.equal(sdk.paused(), true);
  assert.equal(run.done, false);
  gd.finishAd();
  await settle();
  assert.equal(sdk.paused(), false);
  assert.equal(run.done, true);
});

void test('a break asked for before the SDK is ready waits for it, and gives up after the ready wait', async (): Promise<void> => {
  const gd: FakeGd = fakeGd();
  const sdk: PortalSdk = createGdSdk(gd.page, SETTINGS);
  const waiting: Promise<void> = breaks(sdk)('start');
  await settle();
  assert.equal(gd.shows, 0);
  gd.emit('SDK_READY');
  await settle();
  assert.equal(gd.shows, 1);
  gd.finishAd();
  await waiting;

  const late: FakeGd = fakeGd();
  const never: PortalSdk = createGdSdk(late.page, SETTINGS);
  const run: Tracked = track(breaks(never)('start'));
  await late.timers.advance(SETTINGS.readyWaitMs);
  assert.equal(run.done, true);
  assert.equal(late.shows, 0);
  assert.equal(late.timers.pending(), 0);
  late.emit('SDK_READY');
  await settle();
  assert.equal(late.shows, 0);
});

void test('a blocked SDK, a throwing showAd and an ad that never ends never hold the break past its wait', async (): Promise<void> => {
  const blocked: FakeGd = fakeGd();
  blocked.sdk = undefined;
  const none: PortalSdk = createGdSdk(blocked.page, SETTINGS);
  blocked.emit('SDK_READY');
  await breaks(none)('start');

  const throwing: FakeGd = fakeGd();
  throwing.sdk = {
    showAd: (): never => {
      throw new Error('no fill');
    },
  };
  const thrown: PortalSdk = createGdSdk(throwing.page, SETTINGS);
  throwing.emit('SDK_READY');
  await breaks(thrown)('start');
  assert.equal(thrown.paused(), false);

  const stuck: FakeGd = fakeGd();
  const held: PortalSdk = createGdSdk(stuck.page, SETTINGS);
  stuck.emit('SDK_READY');
  const run: Tracked = track(breaks(held)('respawn'));
  await settle();
  assert.equal(held.paused(), true);
  await stuck.timers.advance(SETTINGS.adLongestMs);
  assert.equal(run.done, true);
  assert.equal(held.paused(), true);
  stuck.finishAd();
  await settle();
  assert.equal(held.paused(), false);
});

void test('the pause lasts as long as the SDK says, and ends when its ad settles even without SDK_GAME_START', async (): Promise<void> => {
  const gd: FakeGd = fakeGd();
  gd.sdk = {
    showAd: (): Promise<void> => {
      gd.emit('SDK_GAME_PAUSE');
      return Promise.reject(new Error('ad error'));
    },
  };
  const sdk: PortalSdk = createGdSdk(gd.page, SETTINGS);
  gd.emit('SDK_READY');
  await breaks(sdk)('start');
  assert.equal(sdk.paused(), false);
});

void test('midrolls keep a gap after any break, a second ask during a break joins it, and the start break ignores the gap', async (): Promise<void> => {
  const gd: FakeGd = fakeGd();
  const sdk: PortalSdk = createGdSdk(gd.page, SETTINGS);
  gd.emit('SDK_READY');
  const first: Promise<void> = breaks(sdk)('start');
  const joined: Promise<void> = breaks(sdk)('respawn');
  await settle();
  assert.equal(gd.shows, 1);
  gd.finishAd();
  await Promise.all([first, joined]);
  await breaks(sdk)('travel');
  assert.equal(gd.shows, 1);
  const again: Promise<void> = breaks(sdk)('start');
  await settle();
  assert.equal(gd.shows, 2);
  gd.finishAd();
  await again;
  gd.clock.now += SETTINGS.breakGapMs;
  const travel: Promise<void> = breaks(sdk)('travel');
  await settle();
  assert.equal(gd.shows, 3);
  gd.finishAd();
  await travel;
});

void test('a pause the SDK starts by itself pauses the game until it says to start again', (): void => {
  const gd: FakeGd = fakeGd();
  const sdk: PortalSdk = createGdSdk(gd.page, SETTINGS);
  gd.emit('SDK_GAME_PAUSE');
  assert.equal(sdk.paused(), true);
  gd.emit('SDK_GDPR_TRACKING');
  assert.equal(sdk.paused(), true);
  gd.emit('SDK_GAME_START');
  assert.equal(sdk.paused(), false);
});
