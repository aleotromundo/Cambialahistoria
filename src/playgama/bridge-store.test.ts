import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeClock, createFakeTimers } from '../../test/backend-support.ts';
import type { FakeTimers } from '../../test/backend-support.ts';
import { createFakeBridge } from '../../test/playgama-support.ts';
import type { FakeBridge } from '../../test/playgama-support.ts';
import { startBridge } from './bridge.ts';
import type { Bridge } from './bridge.ts';
import { BRIDGE_STORE, entriesText, loadBridgeStore, readEntries } from './bridge-store.ts';
import type { BridgeStore } from './bridge-store.ts';

interface Rig {
  readonly fake: FakeBridge;
  readonly timers: FakeTimers;
  readonly store: BridgeStore;
}

async function rig(stored: Readonly<Record<string, unknown>> = {}): Promise<Rig> {
  const fake: FakeBridge = createFakeBridge({ stored });
  const bridge: Bridge | null = await startBridge(fake.raw);
  if (bridge === null) throw new Error('the fake bridge did not read');
  const timers: FakeTimers = createFakeTimers(createFakeClock());
  return { fake, timers, store: await loadBridgeStore(bridge, timers.timers) };
}

void test('the saved entries read back from their one stored text, and anything else reads as none', (): void => {
  assert.deepEqual([...readEntries(entriesText(new Map([['a', '1']])))], [['a', '1']]);
  assert.equal(readEntries(null).size, 0);
  assert.equal(readEntries('{broken').size, 0);
  assert.equal(readEntries('[1]').size, 0);
  assert.deepEqual([...readEntries('{"a":"1","b":2}')], [['a', '1']]);
});

void test('a platform that hands the stored text back already parsed still reads every entry', async (): Promise<void> => {
  assert.deepEqual([...readEntries({ a: '{"level":3}', b: 2 })], [['a', '{"level":3}']]);
  const { store }: Rig = await rig({ [BRIDGE_STORE.key]: { 'the-lost-storm.save.v1': '{}' } });
  assert.equal(store.read('the-lost-storm.save.v1'), '{}');
});

void test('the store loads every key with one read at start', async (): Promise<void> => {
  const { fake, store }: Rig = await rig({ [BRIDGE_STORE.key]: '{"the-lost-storm.save.v1":"{}"}' });
  assert.deepEqual(fake.gets, [[BRIDGE_STORE.key]]);
  assert.equal(store.read('the-lost-storm.save.v1'), '{}');
  assert.equal(store.read('missing'), null);
});

void test('writes settle into one set of every key after a quiet spell', async (): Promise<void> => {
  const { fake, timers, store }: Rig = await rig();
  assert.equal(store.write('a', '1'), true);
  store.write('b', '2');
  store.remove('a');
  assert.equal(store.read('b'), '2');
  assert.equal(fake.sets.length, 0);
  await timers.advance(BRIDGE_STORE.settleMs);
  assert.deepEqual(fake.sets, [{ keys: [BRIDGE_STORE.key], values: ['{"b":"2"}'] }]);
});

void test('writing what is already stored and removing what is not cost no set', async (): Promise<void> => {
  const { fake, timers, store }: Rig = await rig({ [BRIDGE_STORE.key]: '{"a":"1"}' });
  store.write('a', '1');
  store.remove('b');
  assert.equal(timers.pending(), 0);
  await store.flush();
  assert.equal(fake.sets.length, 0);
});

void test('a flush writes at once and leaves no timer behind', async (): Promise<void> => {
  const { fake, timers, store }: Rig = await rig();
  store.write('a', '1');
  await store.flush();
  assert.equal(fake.sets.length, 1);
  assert.equal(timers.pending(), 0);
});

void test('a set the platform refuses is written again with the next change', async (): Promise<void> => {
  const { fake, timers, store }: Rig = await rig();
  fake.failSets = true;
  store.write('a', '1');
  await store.flush();
  fake.failSets = false;
  await store.flush();
  assert.equal(fake.sets.length, 2);
  assert.equal(fake.stored.get(BRIDGE_STORE.key), '{"a":"1"}');
  assert.equal(timers.pending(), 0);
});

void test('a set the platform never answers stops holding the saves after a wait, and the next flush writes them', async (): Promise<void> => {
  const { fake, timers, store }: Rig = await rig();
  fake.hangSets = true;
  store.write('a', '1');
  const held: Promise<void> = store.flush();
  await timers.advance(0);
  await timers.advance(BRIDGE_STORE.setWaitMs);
  await held;
  fake.hangSets = false;
  store.write('b', '2');
  await store.flush();
  assert.equal(fake.sets.length, 2);
  assert.equal(fake.stored.get(BRIDGE_STORE.key), '{"a":"1","b":"2"}');
  assert.equal(timers.pending(), 0);
});

void test('a set that answers after its wait, behind a newer one, is followed at once by the newest entries', async (): Promise<void> => {
  const fake: FakeBridge = createFakeBridge();
  const bridge: Bridge | null = await startBridge(fake.raw);
  if (bridge === null) throw new Error('the fake bridge did not read');
  const answers: (() => void)[] = [];
  const slow: Bridge = { ...bridge, storageSet: (keys: readonly string[], values: readonly string[]): Promise<void> => (answers.length === 0 ? new Promise<void>((resolve: () => void): void => void answers.push((): void => void bridge.storageSet(keys, values).then(resolve))) : bridge.storageSet(keys, values)) };
  const timers: FakeTimers = createFakeTimers(createFakeClock());
  const store: BridgeStore = await loadBridgeStore(slow, timers.timers);
  store.write('a', '1');
  const held: Promise<void> = store.flush();
  await timers.advance(0);
  await timers.advance(BRIDGE_STORE.setWaitMs);
  await held;
  store.write('a', '2');
  await store.flush();
  assert.equal(fake.stored.get(BRIDGE_STORE.key), '{"a":"2"}');
  for (const answer of answers) answer();
  await timers.advance(0);
  assert.equal(fake.stored.get(BRIDGE_STORE.key), '{"a":"2"}');
  assert.equal(fake.sets.length, 3);
  assert.equal(timers.pending(), 0);
});
