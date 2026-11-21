import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QUIET_SDK, startPortalSdk } from './portal-sdk.ts';
import type { PortalSdk } from './portal-sdk.ts';

void test('the site and the portals with no SDK start at once with one that never pauses and sends nothing', async (): Promise<void> => {
  const sdk: PortalSdk = await startPortalSdk();
  assert.equal(sdk, QUIET_SDK);
  sdk.ready();
  sdk.gameplay(true);
  sdk.gameplay(false);
  assert.equal(sdk.paused(), false);
});
