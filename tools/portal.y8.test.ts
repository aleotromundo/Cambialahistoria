import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Y8_SDK } from '../src/portal-sdk-y8.ts';
import { GAMEPIX, PORTAL_TARGETS, Y8, missingBuildEnv, outsideAddresses, portalTarget, shipsInPortal } from './portal.ts';
import type { PortalTarget } from './portal.ts';

void test('the Y8 build is found by its mode, is sealed and leaves out what GamePix leaves out', (): void => {
  assert.equal(portalTarget('y8'), Y8);
  assert.equal(Y8.sealed, true);
  assert.equal(shipsInPortal('landing/spin.mp4', Y8.leftOut), false);
  assert.equal(shipsInPortal('models/characters/man.glb', Y8.leftOut), true);
});

void test('the Y8 build swaps what GamePix swaps, the framed host included, and its own SDK module for the quiet one', (): void => {
  assert.equal(Y8.swaps['src/host.ts'], 'src/host-framed.ts');
  assert.deepEqual(Y8.swaps, { ...GAMEPIX.swaps, 'src/portal-sdk.ts': 'src/portal-sdk-y8.ts' });
  for (const [from, to] of Object.entries(Y8.swaps)) assert.equal(to.slice(0, to.lastIndexOf('/')), from.slice(0, from.lastIndexOf('/')));
});

void test('only the Y8 build lets through an address, and only the SDK script Y8 serves', (): void => {
  const text: string = `s.src="${Y8_SDK.script}";fetch("https://cdn.y8.com/other.js")`;
  assert.deepEqual(outsideAddresses(text, Y8.hostAddresses), ['https://cdn.y8.com/other.js']);
  for (const target of PORTAL_TARGETS) if (target !== Y8) assert.deepEqual(outsideAddresses(text, target.hostAddresses), [Y8_SDK.script, 'https://cdn.y8.com/other.js'], target.mode);
});

void test('a Y8 build with no App ID in its environment is reported, and other builds need none', (): void => {
  assert.deepEqual(missingBuildEnv(Y8, {}), [Y8_SDK.appIdEnv]);
  assert.deepEqual(missingBuildEnv(Y8, { [Y8_SDK.appIdEnv]: ' ' }), [Y8_SDK.appIdEnv]);
  assert.deepEqual(missingBuildEnv(Y8, { [Y8_SDK.appIdEnv]: 'app-1' }), []);
  for (const target of PORTAL_TARGETS.filter((each: PortalTarget): boolean => each !== Y8)) assert.deepEqual(missingBuildEnv(target, {}), [], target.mode);
});
