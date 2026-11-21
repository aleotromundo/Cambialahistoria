import { createBrowserTimers } from '../browser-timers.ts';
import { BRIDGE } from './bridge.ts';
import { startPlaygama } from './host.ts';
import type { PlaygamaStart } from './host.ts';

let session: Promise<PlaygamaStart | null> | null = null;

function hideListener(listener: () => void): void {
  document.addEventListener('visibilitychange', (): void => {
    if (document.hidden) listener();
  });
  window.addEventListener('pagehide', listener);
}

export function browserPlaygama(): Promise<PlaygamaStart | null> {
  session ??= startPlaygama(Reflect.get(window, BRIDGE.global), { timers: createBrowserTimers(), onHide: hideListener });
  return session;
}
