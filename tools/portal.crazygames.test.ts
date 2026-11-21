import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { loadContent } from '../sim/content/content.ts';
import type { SurfaceDef } from '../sim/content/prop-types.ts';
import { texturePath } from '../src/mobile/quality.ts';
import { CRAZYGAMES, GAMEPIX, PORTAL, filesUnder, megabytes, outsideAddresses, portalTarget, sealPage, shipsInPortal, targetLimits, withHeadScripts } from './portal.ts';
import type { PortalFile } from './portal.ts';

const PUBLIC: string = join(import.meta.dirname, '..', 'public');
const BUNDLE_ROOM_BYTES: number = 8 * 1000 * 1000;
const SDK_SCRIPT: string = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

function shipped(): readonly PortalFile[] {
  return filesUnder(PUBLIC).filter((file: PortalFile): boolean => shipsInPortal(file.path, CRAZYGAMES.leftOut, CRAZYGAMES.keptIn ?? []));
}

void test('the CrazyGames build is found by its Vite mode and keeps every GamePix swap', (): void => {
  assert.equal(portalTarget('crazygames'), CRAZYGAMES);
  assert.equal(CRAZYGAMES.sealed, true);
  for (const [from, to] of Object.entries(GAMEPIX.swaps)) assert.equal(CRAZYGAMES.swaps[from], to);
  for (const [from, to] of Object.entries(CRAZYGAMES.swaps)) assert.equal(to.slice(0, to.lastIndexOf('/')), from.slice(0, from.lastIndexOf('/')));
});

void test('CrazyGames allows 50 MB for the game it loads and 1,500 files; the other portals keep the itch.io limits', (): void => {
  assert.deepEqual(targetLimits(CRAZYGAMES), { files: 1500, totalBytes: 50_000_000, fileBytes: 50_000_000 });
  assert.equal(targetLimits(GAMEPIX), PORTAL.limits);
});

void test('the files the CrazyGames build takes from public/ leave room for the bundle under its limit', (): void => {
  const files: readonly PortalFile[] = shipped();
  const bytes: number = files.reduce((sum: number, file: PortalFile): number => sum + file.bytes, 0);
  const limits = targetLimits(CRAZYGAMES);
  assert.ok(bytes + BUNDLE_ROOM_BYTES <= limits.totalBytes, `public/ files are ${megabytes(bytes)}, and with ${megabytes(BUNDLE_ROOM_BYTES)} for the bundle that is over ${megabytes(limits.totalBytes)}`);
  assert.ok(files.length < limits.files);
});

void test('the CrazyGames build ships only the half-size textures, and every surface has one', (): void => {
  assert.equal(shipsInPortal('textures/iron_color.webp', CRAZYGAMES.leftOut, CRAZYGAMES.keptIn ?? []), false);
  assert.equal(shipsInPortal('textures/half/iron_color.webp', CRAZYGAMES.leftOut, CRAZYGAMES.keptIn ?? []), true);
  assert.equal(shipsInPortal('landing/spin.mp4', CRAZYGAMES.leftOut, CRAZYGAMES.keptIn ?? []), false);
  const paths: ReadonlySet<string> = new Set<string>(shipped().map((file: PortalFile): string => file.path));
  const textures: readonly string[] = [...loadContent().surfaces.values()].flatMap((surface: SurfaceDef): string[] => [surface.color, surface.normal, surface.orm].filter((path: string | null): path is string => path !== null));
  const missing: readonly string[] = textures.map((path: string): string => texturePath(path, true)).filter((path: string): boolean => !paths.has(path));
  assert.deepEqual(missing, []);
});

void test('the sealed CrazyGames page loads the SDK script in its head, the one outside address it allows', (): void => {
  assert.deepEqual(CRAZYGAMES.headScripts, [SDK_SCRIPT]);
  const page: string = withHeadScripts(sealPage('<head><meta charset="utf-8" /></head><body class="a"></body>'), CRAZYGAMES.headScripts ?? []);
  assert.equal(page, `<head><meta charset="utf-8" /><script src="${SDK_SCRIPT}"></script></head><body class="a still"></body>`);
  assert.deepEqual(CRAZYGAMES.hostAddresses, [SDK_SCRIPT]);
  assert.deepEqual(outsideAddresses(page, CRAZYGAMES.hostAddresses), []);
  assert.deepEqual(outsideAddresses(page), [SDK_SCRIPT]);
  assert.equal(withHeadScripts('<p>x</p>', []), '<p>x</p>');
  assert.throws((): string => withHeadScripts('<p>x</p>', [SDK_SCRIPT]), /no <\/head>/);
});
