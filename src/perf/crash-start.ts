import type { WebGLInfo, WebGLRenderer } from 'three';
import type { PlayerEventBody } from '../backend/api.ts';
import type { KeyValueStore } from '../backend/backend.ts';
import { pagePlay } from '../backend/browser.ts';
import { readServerUrl } from '../backend/server-url.ts';
import { createBrowserStore } from '../storage.ts';
import type { World } from '../../sim/world/types.ts';
import { buildId } from './device-facts.ts';
import { CRASH_WATCH, errorEvent, heapMegabytes, readMarks, takeCrashes, withMark, writeMarks } from './crash-watch.ts';
import type { AliveMark, TakenCrashes } from './crash-watch.ts';

export interface CrashDeps {
  readonly serverUrl: string | undefined;
  readonly build: string | undefined;
  readonly renderer: WebGLRenderer;
  readonly world: World;
  tier(): string;
  report(events: readonly PlayerEventBody[]): void;
}

export interface CrashWatch {
  frame(now: number): void;
}

const SILENT: CrashWatch = { frame: (): void => {} };

function usedHeap(): number | null {
  const memory: unknown = Reflect.get(performance, 'memory');
  if (typeof memory !== 'object' || memory === null) return null;
  const used: unknown = Reflect.get(memory, 'usedJSHeapSize');
  return typeof used === 'number' && Number.isFinite(used) ? used : null;
}

async function heldPlays(): Promise<ReadonlySet<string> | null> {
  if (!('locks' in navigator)) return null;
  try {
    const held: LockManagerSnapshot = await navigator.locks.query();
    const plays: Set<string> = new Set<string>();
    for (const lock of held.held ?? []) {
      const name: string = lock.name ?? '';
      if (name.startsWith(CRASH_WATCH.lockPrefix)) plays.add(name.slice(CRASH_WATCH.lockPrefix.length));
    }
    return plays;
  } catch {
    return null;
  }
}

function holdLock(play: string): Promise<void> {
  if (!('locks' in navigator)) return Promise.resolve();
  return new Promise<void>((granted: () => void): void => {
    navigator.locks
      .request(`${CRASH_WATCH.lockPrefix}${play}`, (): Promise<void> => {
        granted();
        return new Promise<void>((): void => {});
      })
      .catch((): void => granted());
  });
}

export function startCrashWatch(deps: CrashDeps): CrashWatch {
  if (readServerUrl(deps.serverUrl).kind !== 'ok') return SILENT;
  const store: KeyValueStore = createBrowserStore();
  const play: string = pagePlay().id;
  const startedAt: number = Date.now();
  const info: WebGLInfo['memory'] = deps.renderer.info.memory;
  let hidden: boolean = document.hidden;
  let closed: boolean = false;
  let lastBeat: number = -Infinity;
  const seenErrors: Set<string> = new Set<string>();
  const mark = (): AliveMark => ({ play, build: buildId(deps.build), zone: deps.world.zone.id, tier: deps.tier(), startedAt, beatAt: Date.now(), hidden, closed, heapMb: heapMegabytes(usedHeap()), textures: info.textures, geometries: info.geometries });
  const beat = (): void => {
    store.write(CRASH_WATCH.key, writeMarks(withMark(readMarks(store.read(CRASH_WATCH.key)), mark())));
  };
  const scan = async (): Promise<void> => {
    await holdLock(play);
    const alive: ReadonlySet<string> | null = await heldPlays();
    const taken: TakenCrashes = takeCrashes(readMarks(store.read(CRASH_WATCH.key)), play, alive, Date.now());
    const own: AliveMark[] = readMarks(store.read(CRASH_WATCH.key)).filter((known: AliveMark): boolean => known.play === play);
    store.write(CRASH_WATCH.key, writeMarks([...own, ...taken.kept]));
    if (taken.crashes.length > 0) deps.report(taken.crashes);
  };
  const failed = (message: string, file: string, line: number): void => {
    if (seenErrors.size >= CRASH_WATCH.errorsPerPage || seenErrors.has(message)) return;
    seenErrors.add(message);
    deps.report([errorEvent({ message, file, line }, deps.world.zone.id, Date.now())]);
  };
  beat();
  void scan();
  document.addEventListener('visibilitychange', (): void => {
    hidden = document.hidden;
    beat();
  });
  window.addEventListener('pagehide', (): void => {
    closed = true;
    beat();
  });
  window.addEventListener('pageshow', (): void => {
    closed = false;
    hidden = document.hidden;
    beat();
  });
  window.addEventListener('error', (event: ErrorEvent): void => {
    failed(event.message === '' ? 'error' : event.message, event.filename, event.lineno === 0 ? CRASH_WATCH.unknown : event.lineno);
  });
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent): void => {
    const reason: unknown = event.reason;
    failed(reason instanceof Error ? `${reason.name}: ${reason.message}` : `rejected: ${typeof reason === 'string' ? reason : typeof reason}`, '', CRASH_WATCH.unknown);
  });
  return {
    frame(now: number): void {
      if (now - lastBeat < CRASH_WATCH.beatMs) return;
      lastBeat = now;
      beat();
    },
  };
}
