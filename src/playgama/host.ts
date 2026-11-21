import type { Timers } from '../backend/backend.ts';
import { within } from '../bounded-wait.ts';
import type { PortalSdk } from '../portal-sdk.ts';
import { BRIDGE, startBridge } from './bridge.ts';
import type { Bridge, InterstitialState } from './bridge.ts';
import { loadBridgeStore } from './bridge-store.ts';
import type { BridgeStore } from './bridge-store.ts';

export const PLAYGAMA = {
  startWaitMs: 8000,
} as const;

export interface PlaygamaStart {
  readonly bridge: Bridge;
  readonly store: BridgeStore;
}

export interface PlaygamaDeps {
  readonly timers: Timers;
  onHide(listener: () => void): void;
}

function quietly(work: () => void): void {
  try {
    work();
  } catch {
    return;
  }
}

async function started(found: unknown, timers: Timers): Promise<PlaygamaStart | null> {
  const bridge: Bridge | null = await startBridge(found);
  if (bridge === null) return null;
  return { bridge, store: await loadBridgeStore(bridge, timers) };
}

export async function startPlaygama(found: unknown, deps: PlaygamaDeps): Promise<PlaygamaStart | null> {
  const loading: Promise<PlaygamaStart | null> = started(found, deps.timers).catch((): null => null);
  const finished: boolean = await within(loading, deps.timers, PLAYGAMA.startWaitMs);
  const ready: PlaygamaStart | null = finished ? await loading : null;
  if (ready !== null) deps.onHide((): void => void ready.store.flush());
  return ready;
}

export function playgamaSdk(bridge: Bridge | null, hidden: () => boolean): PortalSdk {
  let platformPaused: boolean = false;
  let adOpen: boolean = false;
  let readySent: boolean = false;
  let playing: boolean = false;
  let owed: boolean = false;
  bridge?.onPause((paused: boolean): void => {
    platformPaused = paused;
  });
  bridge?.onInterstitial((state: InterstitialState): void => {
    adOpen = state === 'opened';
  });
  const paused = (): boolean => platformPaused || adOpen;
  return {
    paused,
    ready(): void {
      if (readySent || bridge === null) return;
      readySent = true;
      quietly((): void => bridge.sendMessage(BRIDGE.ready));
    },
    gameplay(active: boolean, atBreak: boolean = true): void {
      const stopped: boolean = playing && !active;
      playing = active;
      if (active) {
        owed = false;
        return;
      }
      if (stopped && !atBreak) {
        owed = true;
        return;
      }
      if (!stopped && !(owed && atBreak)) return;
      owed = false;
      if (bridge === null || hidden() || adOpen) return;
      quietly((): void => bridge.showInterstitial());
    },
  };
}
