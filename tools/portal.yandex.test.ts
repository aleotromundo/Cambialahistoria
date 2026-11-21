import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GAMEPIX, PORTAL_TARGETS, YANDEX, portalTarget, shipsInPortal } from './portal.ts';

void test('the Yandex build is found by its mode and is sealed like GamePix, with no outside link', (): void => {
  assert.equal(portalTarget('yandex'), YANDEX);
  assert.ok(PORTAL_TARGETS.includes(YANDEX));
  assert.equal(YANDEX.sealed, true);
  assert.equal(shipsInPortal('landing/spin.mp4', YANDEX.leftOut), false);
  assert.equal(shipsInPortal('models/characters/man.glb', YANDEX.leftOut), true);
});

void test('the Yandex build makes every quiet swap GamePix makes and swaps in the Yandex Games SDK', (): void => {
  for (const [from, to] of Object.entries(GAMEPIX.swaps)) assert.equal(YANDEX.swaps[from], to);
  assert.equal(YANDEX.swaps['src/portal-sdk.ts'], 'src/portal-sdk-yandex.ts');
  assert.equal(GAMEPIX.swaps['src/portal-sdk.ts'], undefined);
});

void test('every portal build writes its own folder and zip', (): void => {
  assert.equal(new Set<string>(PORTAL_TARGETS.map((target): string => target.outDir)).size, PORTAL_TARGETS.length);
  assert.equal(new Set<string>(PORTAL_TARGETS.map((target): string => target.zip)).size, PORTAL_TARGETS.length);
});
