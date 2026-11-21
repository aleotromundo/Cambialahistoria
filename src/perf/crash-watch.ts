import { EVENTS_PROTOCOL } from '../backend/api.ts';
import type { PlayerEventBody } from '../backend/api.ts';

export const CRASH_WATCH = {
  key: 'lost-storm-alive',
  lockPrefix: 'lost-storm-alive:',
  beatMs: 5000,
  staleMs: 20_000,
  pastMs: 30 * 86_400_000,
  most: 4,
  errorsPerPage: 5,
  msPerSecond: 1000,
  bytesPerMb: 1_048_576,
  unknown: -1,
} as const;

export interface AliveMark {
  readonly play: string;
  readonly build: string;
  readonly zone: string;
  readonly tier: string;
  readonly startedAt: number;
  readonly beatAt: number;
  readonly hidden: boolean;
  readonly closed: boolean;
  readonly heapMb: number;
  readonly textures: number;
  readonly geometries: number;
}

export interface TakenCrashes {
  readonly crashes: readonly PlayerEventBody[];
  readonly kept: readonly AliveMark[];
}

export interface ScriptError {
  readonly message: string;
  readonly file: string;
  readonly line: number;
}

const ZONE_ID: RegExp = /^[A-Za-z0-9_-]{1,64}$/;
const NOT_PRINTABLE: RegExp = /[^\x20-\x7e]/g;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function flag(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export function printable(value: string): string {
  return value.replace(NOT_PRINTABLE, '?').slice(0, EVENTS_PROTOCOL.textChars);
}

function readMark(value: unknown): AliveMark | null {
  if (!isRecord(value)) return null;
  const play: string | null = text(value['play']);
  const build: string | null = text(value['build']);
  const zone: string | null = text(value['zone']);
  const tier: string | null = text(value['tier']);
  const startedAt: number | null = count(value['startedAt']);
  const beatAt: number | null = count(value['beatAt']);
  const hidden: boolean | null = flag(value['hidden']);
  const closed: boolean | null = flag(value['closed']);
  const heapMb: number | null = count(value['heapMb']);
  const textures: number | null = count(value['textures']);
  const geometries: number | null = count(value['geometries']);
  if (play === null || build === null || zone === null || tier === null || startedAt === null || beatAt === null || hidden === null || closed === null || heapMb === null || textures === null || geometries === null) return null;
  return { play, build, zone, tier, startedAt, beatAt, hidden, closed, heapMb, textures, geometries };
}

export function readMarks(stored: string | null): AliveMark[] {
  if (stored === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const list: readonly unknown[] = parsed;
  const marks: AliveMark[] = [];
  for (const entry of list) {
    const mark: AliveMark | null = readMark(entry);
    if (mark !== null) marks.push(mark);
  }
  return marks;
}

export function writeMarks(marks: readonly AliveMark[]): string {
  return JSON.stringify(marks);
}

export function withMark(marks: readonly AliveMark[], mark: AliveMark): AliveMark[] {
  const others: AliveMark[] = marks.filter((known: AliveMark): boolean => known.play !== mark.play);
  others.sort((a: AliveMark, b: AliveMark): number => b.beatAt - a.beatAt);
  return [mark, ...others.slice(0, CRASH_WATCH.most - 1)];
}

export function crashEvent(mark: AliveMark): PlayerEventBody {
  return {
    kind: 'crashed',
    at: Math.round(mark.beatAt),
    zone: ZONE_ID.test(mark.zone) ? mark.zone : 'unknown',
    fields: {
      play: printable(mark.play),
      build: printable(mark.build),
      up_s: Math.max(0, Math.round((mark.beatAt - mark.startedAt) / CRASH_WATCH.msPerSecond)),
      hidden: mark.hidden,
      heap_mb: Math.round(mark.heapMb),
      textures: Math.round(mark.textures),
      geometries: Math.round(mark.geometries),
      tier: printable(mark.tier),
    },
  };
}

export function takeCrashes(marks: readonly AliveMark[], own: string, alive: ReadonlySet<string> | null, now: number): TakenCrashes {
  const crashes: PlayerEventBody[] = [];
  const kept: AliveMark[] = [];
  for (const mark of marks) {
    if (mark.play === own || mark.closed) continue;
    const living: boolean = alive === null ? now - mark.beatAt < CRASH_WATCH.staleMs : alive.has(mark.play);
    if (living) {
      kept.push(mark);
      continue;
    }
    if (now - mark.beatAt > CRASH_WATCH.pastMs) continue;
    crashes.push(crashEvent(mark));
  }
  return { crashes, kept };
}

export function sourceFile(url: string): string {
  const path: string = url.split(/[?#]/)[0] ?? '';
  const name: string = path.slice(path.lastIndexOf('/') + 1);
  return printable(name);
}

export function errorEvent(error: ScriptError, zone: string, at: number): PlayerEventBody {
  return {
    kind: 'error',
    at: Math.round(at),
    zone: ZONE_ID.test(zone) ? zone : 'unknown',
    fields: { message: printable(error.message), file: sourceFile(error.file), line: Math.max(CRASH_WATCH.unknown, Math.round(error.line)) },
  };
}

export function heapMegabytes(usedBytes: number | null): number {
  return usedBytes === null ? CRASH_WATCH.unknown : Math.round(usedBytes / CRASH_WATCH.bytesPerMb);
}
