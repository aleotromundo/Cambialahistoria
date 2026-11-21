import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeClock, createFakeTimers } from '../../test/backend-support.ts';
import type { FakeTimers } from '../../test/backend-support.ts';
import { createFakeBridge, FAKE_EVENTS } from '../../test/playgama-support.ts';
import type { FakeBridge, FakeBridgeOptions } from '../../test/playgama-support.ts';
import type { PortalSdk } from '../portal-sdk.ts';
import { readBridge } from './bridge.ts';
import type { Bridge } from './bridge.ts';
import { BRIDGE_STORE } from './bridge-store.ts';
import { PLAYGAMA, playgamaSdk, startPlaygama } from './host.ts';
import type { PlaygamaStart } from './host.ts';

interface Starting {
  readonly fake: FakeBridge;
  readonly timers: FakeTimers;
  readonly hidden: (() => void)[];
  readonly start: Promise<PlaygamaStart | null>;
}

interface Sdk {
  readonly fake: FakeBridge;
  readonly sdk: PortalSdk;
  readonly page: { hidden: boolean };
}

function throwing(): void {
  throw new Error('platform gone');
}

function begin(options: FakeBridgeOptions = {}, found: unknown = null): Starting {
  const fake: FakeBridge = createFakeBridge(options);
  const timers: FakeTimers = createFakeTimers(createFakeClock());
  const hidden: (() => void)[] = [];
  const start: Promise<PlaygamaStart | null> = startPlaygama(found ?? fake.raw, { timers: timers.timers, onHide: (listener: () => void): void => void hidden.push(listener) });
  return { fake, timers, hidden, start };
}

function sdkOver(modules: Readonly<Record<string, unknown>> | null = null): Sdk {
  const fake: FakeBridge = createFakeBridge();
  const bridge: Bridge | null = readBridge(modules ?? fake.modules);
  if (bridge === null) throw new Error('the fake bridge did not read');
  const page: { hidden: boolean } = { hidden: false };
  return { fake, sdk: playgamaSdk(bridge, (): boolean => page.hidden), page };
}

void test('a page with no bridge starts nothing and keeps its own storage', async (): Promise<void> => {
  const { start, hidden }: Starting = begin({}, 'missing');
  assert.equal(await start, null);
  assert.equal(hidden.length, 0);
});

void test('a bridge that fails to start leaves the game on its own storage', async (): Promise<void> => {
  const { start, fake }: Starting = begin({ initialize: 'fail' });
  assert.equal(await start, null);
  assert.equal(fake.gets.length, 0);
});

void test('a bridge that never starts holds the game for the start wait only', async (): Promise<void> => {
  const { start, timers }: Starting = begin({ initialize: 'hang' });
  await timers.advance(PLAYGAMA.startWaitMs);
  assert.equal(await start, null);
});

void test('a started bridge lends its storage, and the store is flushed when the page hides', async (): Promise<void> => {
  const { start, hidden, fake, timers }: Starting = begin({ stored: { [BRIDGE_STORE.key]: '{"a":"1"}' } });
  const started: PlaygamaStart | null = await start;
  if (started === null) throw new Error('the bridge did not start');
  assert.equal(started.store.read('a'), '1');
  started.store.write('a', '2');
  for (const listener of hidden) listener();
  await timers.advance(0);
  assert.equal(fake.sets.length, 1);
  assert.deepEqual(fake.sets.at(-1), { keys: [BRIDGE_STORE.key], values: ['{"a":"2"}'] });
});

void test('game_ready is sent once, and only when the game says it is ready', (): void => {
  const { sdk, fake }: Sdk = sdkOver();
  assert.deepEqual(fake.sent, []);
  sdk.ready();
  sdk.ready();
  assert.deepEqual(fake.sent, ['game_ready']);
});

void test('each stop in play asks the bridge for an interstitial and leaves the timing to it', (): void => {
  const { sdk, fake }: Sdk = sdkOver();
  sdk.gameplay(false);
  assert.equal(fake.interstitials, 0);
  sdk.gameplay(true);
  sdk.gameplay(true);
  assert.equal(fake.interstitials, 0);
  sdk.gameplay(false);
  sdk.gameplay(false);
  assert.equal(fake.interstitials, 1);
  sdk.gameplay(true);
  sdk.gameplay(false);
  assert.equal(fake.interstitials, 2);
});

void test('a stop because the page hid or while an interstitial is open asks for no interstitial', (): void => {
  const { sdk, fake, page }: Sdk = sdkOver();
  sdk.gameplay(true);
  page.hidden = true;
  sdk.gameplay(false);
  page.hidden = false;
  sdk.gameplay(true);
  fake.emit(FAKE_EVENTS['INTERSTITIAL_STATE_CHANGED'] ?? '', 'opened');
  sdk.gameplay(false);
  assert.equal(fake.interstitials, 0);
});

void test('a stop at a break asks for an interstitial even while the bridge reports a pause from a window blur', (): void => {
  const { sdk, fake }: Sdk = sdkOver();
  sdk.gameplay(true);
  fake.emit(FAKE_EVENTS['PAUSE_STATE_CHANGED'] ?? '', true);
  sdk.gameplay(false, true);
  assert.equal(fake.interstitials, 1);
});

void test('a break that comes while play is already stopped by a pause asks once, and play resuming clears it', (): void => {
  const { sdk, fake }: Sdk = sdkOver();
  sdk.gameplay(true);
  sdk.gameplay(false, false);
  sdk.gameplay(false, false);
  assert.equal(fake.interstitials, 0);
  sdk.gameplay(false, true);
  sdk.gameplay(false, true);
  assert.equal(fake.interstitials, 1);
  sdk.gameplay(true);
  sdk.gameplay(false, false);
  sdk.gameplay(true);
  sdk.gameplay(false, false);
  sdk.gameplay(true);
  assert.equal(fake.interstitials, 1);
});

void test('the title and the lobby before any play ask for no interstitial', (): void => {
  const { sdk, fake }: Sdk = sdkOver();
  sdk.gameplay(false, true);
  sdk.gameplay(false, true);
  assert.equal(fake.interstitials, 0);
});

void test('a stop that is not a break, a lost touch or another tab taking over, asks for no interstitial', (): void => {
  const { sdk, fake }: Sdk = sdkOver();
  sdk.gameplay(true, true);
  sdk.gameplay(false, false);
  assert.equal(fake.interstitials, 0);
  sdk.gameplay(true, true);
  sdk.gameplay(false, true);
  assert.equal(fake.interstitials, 1);
});

void test('the game holds while the platform pauses it or an interstitial is open', (): void => {
  const { sdk, fake }: Sdk = sdkOver();
  assert.equal(sdk.paused(), false);
  fake.emit(FAKE_EVENTS['INTERSTITIAL_STATE_CHANGED'] ?? '', 'opened');
  assert.equal(sdk.paused(), true);
  fake.emit(FAKE_EVENTS['INTERSTITIAL_STATE_CHANGED'] ?? '', 'closed');
  assert.equal(sdk.paused(), false);
  fake.emit(FAKE_EVENTS['PAUSE_STATE_CHANGED'] ?? '', true);
  assert.equal(sdk.paused(), true);
  fake.emit(FAKE_EVENTS['PAUSE_STATE_CHANGED'] ?? '', false);
  assert.equal(sdk.paused(), false);
});

void test('with no bridge the SDK never pauses and sends nothing', (): void => {
  const sdk: PortalSdk = playgamaSdk(null, (): boolean => false);
  sdk.ready();
  sdk.gameplay(true);
  sdk.gameplay(false);
  assert.equal(sdk.paused(), false);
});

void test('a bridge that throws on a message or an ad never stops the game', (): void => {
  const fake: FakeBridge = createFakeBridge();
  const { sdk }: Sdk = sdkOver({ ...fake.modules, platform: { sendMessage: throwing }, advertisement: { showInterstitial: throwing } });
  assert.doesNotThrow((): void => sdk.ready());
  sdk.gameplay(true);
  assert.doesNotThrow((): void => sdk.gameplay(false));
});
