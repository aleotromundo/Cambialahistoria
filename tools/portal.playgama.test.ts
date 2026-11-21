import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BRIDGE } from '../src/playgama/bridge.ts';
import { GAMEPIX, PLAYGAMA, PLAYGAMA_BRIDGE_CONFIG, PORTAL_TARGETS, outsideAddresses, portalTarget, sealPage, shipsInPortal, withFirstScripts } from './portal.ts';

void test('the Playgama build is a sealed build of its own beside GamePix', (): void => {
  assert.equal(portalTarget('playgama'), PLAYGAMA);
  assert.ok(PORTAL_TARGETS.includes(PLAYGAMA));
  assert.equal(PLAYGAMA.sealed, true);
  assert.equal(PLAYGAMA.zip, 'the-lost-storm-playgama.zip');
  assert.equal(shipsInPortal('landing/spin.mp4', PLAYGAMA.leftOut), false);
  assert.equal(GAMEPIX.headScripts, undefined);
});

void test('Playgama takes every GamePix swap and adds its host rules, its Bridge SDK and its Bridge storage', (): void => {
  for (const [from, to] of Object.entries(GAMEPIX.swaps)) {
    if (from !== 'src/host.ts') assert.equal(PLAYGAMA.swaps[from], to);
  }
  assert.equal(PLAYGAMA.swaps['src/host.ts'], 'src/host-playgama.ts');
  assert.equal(PLAYGAMA.swaps['src/portal-sdk.ts'], 'src/portal-sdk-playgama.ts');
  assert.equal(PLAYGAMA.swaps['src/storage.ts'], 'src/storage-playgama.ts');
  for (const [from, to] of Object.entries(PLAYGAMA.swaps)) assert.equal(to.slice(0, to.lastIndexOf('/')), from.slice(0, from.lastIndexOf('/')));
});

void test('the Bridge config ships beside the page as JSON', (): void => {
  assert.deepEqual(Object.keys(PLAYGAMA.hostFiles ?? {}), [BRIDGE.config]);
  const parsed: unknown = JSON.parse(PLAYGAMA.hostFiles?.[BRIDGE.config] ?? '');
  assert.deepEqual(parsed, PLAYGAMA_BRIDGE_CONFIG);
});

void test('the host script goes first in the head, before every other script, and a build with none is left alone', (): void => {
  const page: string = '<!doctype html><html><head>\n<meta charset="utf-8" /><script>var a;</script></head><body class="x"></body></html>';
  const hosted: string = withFirstScripts(page, PLAYGAMA.firstScripts ?? []);
  assert.equal(hosted, `<!doctype html><html><head><script src="${BRIDGE.script}"></script>\n<meta charset="utf-8" /><script>var a;</script></head><body class="x"></body></html>`);
  assert.equal(withFirstScripts(page, []), page);
  assert.throws((): string => withFirstScripts('<body></body>', PLAYGAMA.firstScripts ?? []), /no <head>/);
});

void test('a sealed page with its host script names only that one outside address, and only for Playgama', (): void => {
  const page: string = withFirstScripts(sealPage('<head><link rel="canonical" href="https://theloststorm.com/play/" /></head><body class="a"></body>'), PLAYGAMA.firstScripts ?? []);
  assert.deepEqual(outsideAddresses(page, PLAYGAMA.hostAddresses), []);
  assert.deepEqual(outsideAddresses(page, GAMEPIX.hostAddresses), [BRIDGE.script]);
  assert.deepEqual(outsideAddresses(`${page}<script src="https://other.example/x.js"></script>`, PLAYGAMA.hostAddresses), ['https://other.example/x.js']);
});
