import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PortalSdk } from './portal-sdk.ts';
import { crazyGamesPortal } from './portal-sdk-crazygames.ts';
import type { CrazyGamesDeps } from './portal-sdk-crazygames.ts';

const SETTLE_TURNS: number = 10;

interface FakeHost {
  readonly root: unknown;
  readonly calls: string[];
}

async function settle(turns: number = SETTLE_TURNS): Promise<void> {
  if (turns === 0) return;
  await Promise.resolve();
  await settle(turns - 1);
}

function fakeHost(environment: string, init: () => Promise<void> = (): Promise<void> => Promise.resolve()): FakeHost {
  const calls: string[] = [];
  const record =
    (name: string): (() => void) =>
    (): void => {
      calls.push(name);
    };
  const sdk = {
    environment: 'disabled',
    init: async (): Promise<void> => {
      calls.push('init');
      await init();
      sdk.environment = environment;
    },
    get game(): object {
      return { loadingStart: record('loadingStart'), loadingStop: record('loadingStop'), gameplayStart: record('gameplayStart'), gameplayStop: record('gameplayStop') };
    },
  };
  return { root: { SDK: sdk }, calls };
}

function deps(root: unknown, warnings: string[] = [], hidden: { now: boolean } = { now: false }): CrazyGamesDeps {
  return { root, hidden: (): boolean => hidden.now, warn: (message: string): void => void warnings.push(message) };
}

function playThrough(sdk: PortalSdk): void {
  sdk.ready();
  sdk.gameplay(true);
  sdk.gameplay(false);
}

void test('on CrazyGames the SDK starts first, loading is reported from boot, and play is reported only when it changes', async (): Promise<void> => {
  const host: FakeHost = fakeHost('crazygames');
  const warnings: string[] = [];
  const sdk: PortalSdk = crazyGamesPortal(deps(host.root, warnings));
  sdk.gameplay(false);
  sdk.ready();
  sdk.ready();
  sdk.gameplay(true);
  sdk.gameplay(true);
  sdk.gameplay(false);
  sdk.gameplay(false);
  sdk.gameplay(true);
  await settle();
  assert.deepEqual(host.calls, ['init', 'loadingStart', 'loadingStop', 'gameplayStart', 'gameplayStop', 'gameplayStart']);
  assert.deepEqual(warnings, []);
  assert.equal(sdk.paused(), false);
});

void test('play that starts before the title said it was ready closes the loading first', async (): Promise<void> => {
  const host: FakeHost = fakeHost('local');
  const sdk: PortalSdk = crazyGamesPortal(deps(host.root));
  sdk.gameplay(true);
  sdk.ready();
  await settle();
  assert.deepEqual(host.calls, ['init', 'loadingStart', 'loadingStop', 'gameplayStart']);
});

void test('a hidden page is left to CrazyGames, which handles a tab switch itself', async (): Promise<void> => {
  const host: FakeHost = fakeHost('crazygames');
  const hidden: { now: boolean } = { now: false };
  const sdk: PortalSdk = crazyGamesPortal(deps(host.root, [], hidden));
  sdk.gameplay(true);
  hidden.now = true;
  sdk.gameplay(false);
  hidden.now = false;
  sdk.gameplay(true);
  await settle();
  assert.deepEqual(host.calls, ['init', 'loadingStart', 'loadingStop', 'gameplayStart']);
});

void test('on any other site the SDK is disabled and never called past init', async (): Promise<void> => {
  const host: FakeHost = fakeHost('disabled');
  playThrough(crazyGamesPortal(deps(host.root)));
  await settle();
  assert.deepEqual(host.calls, ['init']);
});

void test('a missing or broken SDK leaves the game running', async (): Promise<void> => {
  assert.doesNotThrow((): void => playThrough(crazyGamesPortal(deps(undefined))));
  assert.doesNotThrow((): void => playThrough(crazyGamesPortal(deps({ SDK: { init: 'no' } }))));
  const host: FakeHost = fakeHost('crazygames', (): Promise<void> => Promise.reject(new Error('blocked')));
  const warnings: string[] = [];
  playThrough(crazyGamesPortal(deps(host.root, warnings)));
  await settle();
  assert.deepEqual(host.calls, ['init']);
  assert.deepEqual(warnings, ['The CrazyGames SDK did not start: Error: blocked']);
});

void test('a call the SDK throws on is reported and the next one still goes through', async (): Promise<void> => {
  const calls: string[] = [];
  const warnings: string[] = [];
  const root = {
    SDK: {
      environment: 'crazygames',
      init: (): Promise<void> => Promise.resolve(),
      game: {
        loadingStart: (): void => {
          throw new Error('too early');
        },
        loadingStop: (): void => void calls.push('loadingStop'),
      },
    },
  };
  crazyGamesPortal(deps(root, warnings)).ready();
  await settle();
  assert.deepEqual(calls, ['loadingStop']);
  assert.deepEqual(warnings, ['The CrazyGames SDK refused loadingStart: Error: too early']);
});
