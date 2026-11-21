import { browserPlaygama } from './playgama/browser.ts';
import { playgamaSdk } from './playgama/host.ts';
import type { PlaygamaStart } from './playgama/host.ts';
import type { PortalSdk } from './portal-sdk.ts';

export function startPortalSdk(): Promise<PortalSdk> {
  return browserPlaygama().then((started: PlaygamaStart | null): PortalSdk => playgamaSdk(started?.bridge ?? null, (): boolean => document.hidden));
}
