import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeBridge, FAKE_EVENTS } from '../../test/playgama-support.ts';
import type { FakeBridge } from '../../test/playgama-support.ts';
import { BRIDGE, readBridge, startBridge } from './bridge.ts';
import type { Bridge, InterstitialState } from './bridge.ts';

async function started(fake: FakeBridge): Promise<Bridge> {
  const bridge: Bridge | null = await startBridge(fake.raw);
  if (bridge === null) throw new Error('the fake bridge did not start');
  return bridge;
}

void test('anything that is not a whole bridge reads as none', (): void => {
  const fake: FakeBridge = createFakeBridge();
  assert.equal(readBridge(undefined), null);
  assert.equal(readBridge('bridge'), null);
  assert.equal(readBridge({ ...fake.modules, storage: { get: (): void => undefined } }), null);
  assert.equal(readBridge({ ...fake.modules, platform: 'web' }), null);
  assert.notEqual(readBridge(fake.modules), null);
});

void test('a bridge is read only after it starts, because its modules exist only then', async (): Promise<void> => {
  const fake: FakeBridge = createFakeBridge();
  assert.equal(readBridge(fake.raw), null);
  await started(fake);
  assert.equal(fake.started(), true);
  assert.notEqual(readBridge(fake.raw), null);
});

void test('something with no initialize is not started at all', async (): Promise<void> => {
  const fake: FakeBridge = createFakeBridge();
  assert.equal(await startBridge(undefined), null);
  assert.equal(await startBridge({ ...fake.modules, initialize: 'soon' }), null);
});

void test('a bridge that fails to start passes its failure on', async (): Promise<void> => {
  await assert.rejects(startBridge(createFakeBridge({ initialize: 'fail' }).raw), /no platform/);
});

void test('a bridge sends its messages and asks for an interstitial through the platform it wraps', async (): Promise<void> => {
  const fake: FakeBridge = createFakeBridge();
  const bridge: Bridge = await started(fake);
  bridge.sendMessage(BRIDGE.ready);
  bridge.showInterstitial();
  assert.deepEqual(fake.sent, ['game_ready']);
  assert.equal(fake.interstitials, 1);
});

void test('storage reads every key in one call and writes keys and values side by side', async (): Promise<void> => {
  const fake: FakeBridge = createFakeBridge({ stored: { a: '1' } });
  const bridge: Bridge = await started(fake);
  assert.deepEqual(await bridge.storageGet(['a', 'b']), ['1', null]);
  await bridge.storageSet(['a'], ['2']);
  assert.deepEqual(fake.gets, [['a', 'b']]);
  assert.deepEqual(fake.sets, [{ keys: ['a'], values: ['2'] }]);
});

void test('a platform that answers a one-key read with the bare value still reads as a list', async (): Promise<void> => {
  const fake: FakeBridge = createFakeBridge();
  const storage: Readonly<Record<string, unknown>> = { get: (): Promise<string> => Promise.resolve('x'), set: (): Promise<void> => Promise.resolve() };
  const bridge: Bridge | null = readBridge({ ...fake.modules, storage });
  assert.deepEqual(await bridge?.storageGet(['a']), ['x']);
});

void test('pause and interstitial events pass on only the values they promise', async (): Promise<void> => {
  const fake: FakeBridge = createFakeBridge();
  const bridge: Bridge = await started(fake);
  const paused: boolean[] = [];
  const states: InterstitialState[] = [];
  bridge.onPause((value: boolean): void => void paused.push(value));
  bridge.onInterstitial((state: InterstitialState): void => void states.push(state));
  fake.emit(FAKE_EVENTS['PAUSE_STATE_CHANGED'] ?? '', true);
  fake.emit(FAKE_EVENTS['PAUSE_STATE_CHANGED'] ?? '', 'yes');
  fake.emit(FAKE_EVENTS['INTERSTITIAL_STATE_CHANGED'] ?? '', 'opened');
  fake.emit(FAKE_EVENTS['INTERSTITIAL_STATE_CHANGED'] ?? '', 'shown');
  fake.emit(FAKE_EVENTS['INTERSTITIAL_STATE_CHANGED'] ?? '', 'closed');
  assert.deepEqual(paused, [true]);
  assert.deepEqual(states, ['opened', 'closed']);
});

void test('a bridge with no event names subscribes to nothing and does not throw', (): void => {
  const fake: FakeBridge = createFakeBridge();
  const bridge: Bridge | null = readBridge({ ...fake.modules, EVENT_NAME: null });
  assert.doesNotThrow((): void => bridge?.onPause((): void => undefined));
});
