import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GD_SDK } from '../src/portal-sdk-gamedistribution.ts';
import { GAMEDISTRIBUTION, GAMEPIX, outsideAddresses, portalTarget, shipsInPortal } from './portal.ts';

void test('the GameDistribution build is a sealed portal build found by its own mode', (): void => {
  assert.equal(portalTarget('gamedistribution'), GAMEDISTRIBUTION);
  assert.equal(GAMEDISTRIBUTION.sealed, true);
  assert.equal(GAMEDISTRIBUTION.outDir, 'dist-gamedistribution');
  assert.equal(GAMEDISTRIBUTION.zip, 'the-lost-storm-gamedistribution.zip');
  assert.equal(shipsInPortal('landing/spin.mp4', GAMEDISTRIBUTION.leftOut), false);
});

void test('it keeps every GamePix swap and swaps the quiet portal SDK for the GameDistribution one', (): void => {
  for (const [from, to] of Object.entries(GAMEPIX.swaps)) assert.equal(GAMEDISTRIBUTION.swaps[from], to);
  assert.equal(GAMEDISTRIBUTION.swaps['src/portal-sdk.ts'], 'src/portal-sdk-gamedistribution.ts');
  assert.equal(GAMEPIX.swaps['src/portal-sdk.ts'], undefined);
  assert.equal(GAMEDISTRIBUTION.buildEnv, undefined);
});

void test('the one outside address it may name is the SDK script the module loads', (): void => {
  assert.deepEqual(GAMEDISTRIBUTION.hostAddresses, [GD_SDK.sdkUrl]);
  const bundle: string = `s.src="${GD_SDK.sdkUrl}";fetch("https://api.example/x")`;
  assert.deepEqual(outsideAddresses(bundle, GAMEDISTRIBUTION.hostAddresses), ['https://api.example/x']);
  assert.deepEqual(outsideAddresses(bundle), [GD_SDK.sdkUrl, 'https://api.example/x']);
  assert.equal(GAMEPIX.hostAddresses, undefined);
});
