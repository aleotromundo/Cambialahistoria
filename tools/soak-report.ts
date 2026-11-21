import { fields, numeric } from '../sim/content/read.ts';
import type { Fields } from '../sim/content/read.ts';

export const SOAK = {
  laps: 8,
  warmLaps: 1,
  leastLaps: 3,
  port: 5471,
  profile: 'soak-walk-profile',
  phone: { width: 844, height: 390, deviceScale: 3 },
  page: '/play/?quality=mobile',
  hero: 'woman',
  chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  lapWaitMs: 900_000,
  megabyte: 1024 * 1024,
  tenths: 10,
} as const;

export interface SoakLimits {
  readonly heapMbPerLap: number;
  readonly gpuMbPerLap: number;
  readonly texturesPerLap: number;
  readonly geometriesPerLap: number;
  readonly programsPerLap: number;
  readonly nodesPerLap: number;
  readonly listenersPerLap: number;
  readonly heapMb: number;
  readonly gpuMb: number;
}

export const SOAK_LIMITS: SoakLimits = {
  heapMbPerLap: 2,
  gpuMbPerLap: 2,
  texturesPerLap: 1,
  geometriesPerLap: 5,
  programsPerLap: 1,
  nodesPerLap: 50,
  listenersPerLap: 50,
  heapMb: 250,
  gpuMb: 200,
};

export interface SoakSample {
  readonly lap: number;
  readonly ms: number;
  readonly heapMb: number;
  readonly gpuMb: number;
  readonly textures: number;
  readonly geometries: number;
  readonly programs: number;
  readonly nodes: number;
  readonly listeners: number;
}

export interface SoakVerdict {
  readonly ok: boolean;
  readonly lines: readonly string[];
  readonly problems: readonly string[];
}

export interface SoakArgs {
  readonly url: string | null;
  readonly chrome: string;
  readonly port: number;
  readonly laps: number;
  readonly hero: string;
  readonly out: string | null;
}

type Measure = Exclude<keyof SoakSample, 'lap' | 'ms'>;

interface Watched {
  readonly measure: Measure;
  readonly label: string;
  readonly perLap: keyof SoakLimits;
  readonly peak: keyof SoakLimits | null;
}

const WATCHED: readonly Watched[] = [
  { measure: 'heapMb', label: 'JS heap MB', perLap: 'heapMbPerLap', peak: 'heapMb' },
  { measure: 'gpuMb', label: 'GPU MB', perLap: 'gpuMbPerLap', peak: 'gpuMb' },
  { measure: 'textures', label: 'live textures', perLap: 'texturesPerLap', peak: null },
  { measure: 'geometries', label: 'live geometries', perLap: 'geometriesPerLap', peak: null },
  { measure: 'programs', label: 'shader programs', perLap: 'programsPerLap', peak: null },
  { measure: 'nodes', label: 'page elements', perLap: 'nodesPerLap', peak: null },
  { measure: 'listeners', label: 'event listeners', perLap: 'listenersPerLap', peak: null },
];

function tenths(value: number): number {
  return Math.round(value * SOAK.tenths) / SOAK.tenths;
}

export function slope(values: readonly number[]): number {
  const count: number = values.length;
  if (count < 2) return 0;
  const meanX: number = (count - 1) / 2;
  const meanY: number = values.reduce((sum: number, value: number): number => sum + value, 0) / count;
  let top: number = 0;
  let bottom: number = 0;
  values.forEach((value: number, index: number): void => {
    top += (index - meanX) * (value - meanY);
    bottom += (index - meanX) ** 2;
  });
  return top / bottom;
}

export function judgeSoak(samples: readonly SoakSample[], limits: SoakLimits = SOAK_LIMITS, warmLaps: number = SOAK.warmLaps): SoakVerdict {
  const settled: readonly SoakSample[] = samples.slice(warmLaps);
  const lines: string[] = samples.map((sample: SoakSample): string => `lap ${sample.lap}: ${Math.round(sample.ms / 1000)} s, heap ${tenths(sample.heapMb)} MB, GPU ${tenths(sample.gpuMb)} MB, ${sample.textures} textures, ${sample.geometries} geometries, ${sample.programs} programs, ${sample.nodes} elements, ${sample.listeners} listeners`);
  if (settled.length < SOAK.leastLaps) return { ok: false, lines, problems: [`only ${settled.length} laps after the first ${warmLaps}; a soak needs at least ${SOAK.leastLaps} to tell growth from noise`] };
  const problems: string[] = [];
  for (const watched of WATCHED) {
    const values: number[] = settled.map((sample: SoakSample): number => sample[watched.measure]);
    const growth: number = slope(values);
    const allowed: number = limits[watched.perLap];
    lines.push(`${watched.label}: ${growth >= 0 ? '+' : ''}${tenths(growth)} a lap (limit ${allowed}), peak ${tenths(Math.max(...values))}`);
    if (growth > allowed) problems.push(`${watched.label} grow by ${tenths(growth)} a lap, over the ${allowed} allowed: something is kept after its zone is left`);
    if (watched.peak === null) continue;
    const ceiling: number = limits[watched.peak];
    const peak: number = Math.max(...samples.map((sample: SoakSample): number => sample[watched.measure]));
    if (peak > ceiling) problems.push(`${watched.label} peak at ${tenths(peak)}, over the ${ceiling} budget`);
  }
  return { ok: problems.length === 0, lines, problems };
}

export function readSample(lap: number, ms: number, memory: unknown, metrics: unknown, heapBytes: number): SoakSample {
  const report: Fields = fields(memory, 'memory report');
  const shown: Fields = fields(metrics, 'page metrics');
  return {
    lap,
    ms,
    heapMb: heapBytes / SOAK.megabyte,
    gpuMb: numeric(report, 'gpuMegabytes', 'memory report'),
    textures: numeric(report, 'liveTextures', 'memory report'),
    geometries: numeric(report, 'liveGeometries', 'memory report'),
    programs: numeric(report, 'programs', 'memory report'),
    nodes: numeric(shown, 'Nodes', 'page metrics'),
    listeners: numeric(shown, 'JSEventListeners', 'page metrics'),
  };
}

function valueOf(argv: readonly string[], name: string): string | null {
  const at: number = argv.indexOf(name);
  if (at < 0) return null;
  const value: string | undefined = argv[at + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value`);
  return value;
}

function whole(name: string, value: string, least: number): number {
  const parsed: number = Number(value);
  if (!Number.isInteger(parsed) || parsed < least) throw new Error(`${name} needs a whole number of at least ${least}, not ${value}`);
  return parsed;
}

export function soakArgs(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): SoakArgs {
  const laps: string | null = valueOf(argv, '--laps');
  const port: string | null = valueOf(argv, '--port');
  return {
    url: valueOf(argv, '--url'),
    chrome: valueOf(argv, '--chrome') ?? env['CHROME_PATH'] ?? SOAK.chrome,
    port: port === null ? SOAK.port : whole('--port', port, 1),
    laps: laps === null ? SOAK.laps : whole('--laps', laps, SOAK.warmLaps + SOAK.leastLaps),
    hero: valueOf(argv, '--hero') ?? SOAK.hero,
    out: valueOf(argv, '--out'),
  };
}
