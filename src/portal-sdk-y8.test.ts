import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Y8_SDK, askReadyAgain, readY8Sdk, startY8, watchFocus, y8Portal } from './portal-sdk-y8.ts';
import type { FocusWatch, Y8AppConfig, Y8Page } from './portal-sdk-y8.ts';
import type { PortalSdk } from './portal-sdk.ts';

interface FakePage extends Y8Page {
  readonly scripts: string[];
  readonly warnings: string[];
  fire(type: string): void;
  load(globals: unknown): void;
}

function fakePage(): FakePage {
  const scripts: string[] = [];
  const warnings: string[] = [];
  const listeners: Map<string, (() => void)[]> = new Map<string, (() => void)[]>();
  let loaded: unknown = {};
  return {
    scripts,
    warnings,
    globals: (): unknown => loaded,
    addScript: (src: string): void => void scripts.push(src),
    onReady(type: string, listener: () => void): void {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    warn: (message: string): void => void warnings.push(message),
    fire(type: string): void {
      for (const listener of listeners.get(type) ?? []) listener();
    },
    load(globals: unknown): void {
      loaded = globals;
    },
  };
}

function fakeY8(inits: Y8AppConfig[]): unknown {
  return { y8: { sdk: (): unknown => ({ init: (config: Y8AppConfig): Promise<void> => (inits.push(config), Promise.reject(new Error('offline'))) }) } };
}

void test('the SDK reader finds nothing on a page without y8, without y8.sdk, or with an sdk that cannot init', (): void => {
  assert.equal(readY8Sdk({}), null);
  assert.equal(readY8Sdk(null), null);
  assert.equal(readY8Sdk({ y8: {} }), null);
  assert.equal(readY8Sdk({ y8: { sdk: (): unknown => ({}) } }), null);
  assert.notEqual(readY8Sdk(fakeY8([])), null);
});

void test('with no App ID the SDK script is never loaded', (): void => {
  const page: FakePage = fakePage();
  assert.equal(startY8(page, ''), 'off');
  assert.equal(startY8(page, '  '), 'off');
  assert.deepEqual(page.scripts, []);
});

void test('with an App ID the script loads from Y8 and the SDK inits once on ready, with no auto sign-in', (): void => {
  const page: FakePage = fakePage();
  const inits: Y8AppConfig[] = [];
  assert.equal(startY8(page, ' app-1 '), 'loading');
  assert.deepEqual(page.scripts, [Y8_SDK.script]);
  page.load(fakeY8(inits));
  page.fire(Y8_SDK.ready);
  page.fire(Y8_SDK.ready);
  assert.deepEqual(inits, [{ appId: 'app-1', autoLogin: false }]);
  assert.deepEqual(page.warnings, []);
});

void test('a ready event with no usable SDK is noted and never throws', (): void => {
  const page: FakePage = fakePage();
  startY8(page, 'app-1');
  page.load({ y8: { sdk: (): never => {
    throw new Error('broken');
  } } });
  assert.doesNotThrow((): void => page.fire(Y8_SDK.ready));
  page.load({ y8: {} });
  page.fire(Y8_SDK.ready);
  assert.equal(page.warnings.length, 2);
});

void test('the ready event is asked for again when the SDK is already on the page', (): void => {
  let asked: number = 0;
  askReadyAgain({ y8: { emitReadyEvent: (): void => void (asked += 1) } });
  askReadyAgain({});
  assert.equal(asked, 1);
});

void test('the focus watch starts as the page is, blurs on blur and comes back on focus', (): void => {
  const target: EventTarget = new EventTarget();
  const unfocused: FocusWatch = watchFocus(target, false);
  assert.equal(unfocused.blurred(), true);
  target.dispatchEvent(new Event('focus'));
  assert.equal(unfocused.blurred(), false);
  const watch: FocusWatch = watchFocus(target, true);
  assert.equal(watch.blurred(), false);
  target.dispatchEvent(new Event('blur'));
  assert.equal(watch.blurred(), true);
  target.dispatchEvent(new Event('focus'));
  assert.equal(watch.blurred(), false);
});

void test('the Y8 portal pauses the world while the game has lost focus and resumes when it has it back', (): void => {
  const target: EventTarget = new EventTarget();
  const portal: PortalSdk = y8Portal(watchFocus(target, true));
  assert.equal(portal.paused(), false);
  target.dispatchEvent(new Event('blur'));
  assert.equal(portal.paused(), true);
  portal.ready();
  portal.gameplay(true);
  target.dispatchEvent(new Event('focus'));
  assert.equal(portal.paused(), false);
});
