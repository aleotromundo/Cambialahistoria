import type { PropDef, RiseSide } from '../content/prop-types.ts';
import type { ReadonlyVec2 } from '../math.ts';
import type { RampAxis, TerrainMap, TileSurface } from './terrain.ts';

export const STAIR_RISE = {
  aligned: 0.99,
  turn: 360,
} as const;

export interface PlacedStair {
  readonly prop: string;
  readonly x: number;
  readonly z: number;
  readonly rotationDegrees: number;
}

const SIDE_HEADINGS: Readonly<Record<RiseSide, number>> = { '+z': 0, '+x': 90, '-z': 180, '-x': 270 };

function wrapped(degrees: number): number {
  return ((degrees % STAIR_RISE.turn) + STAIR_RISE.turn) % STAIR_RISE.turn;
}

export function rampRise(axis: RampAxis, climbsForward: boolean): RiseSide {
  if (axis === 'x') return climbsForward ? '+x' : '-x';
  return climbsForward ? '+z' : '-z';
}

export function turnToRise(local: RiseSide, world: RiseSide): number {
  return wrapped(SIDE_HEADINGS[world] - SIDE_HEADINGS[local]);
}

export function risesToward(local: RiseSide, rotationDegrees: number): ReadonlyVec2 {
  const radians: number = (wrapped(SIDE_HEADINGS[local] + rotationDegrees) * Math.PI) / 180;
  return { x: Math.sin(radians), z: Math.cos(radians) };
}

function sideVector(side: RiseSide): ReadonlyVec2 {
  return risesToward('+z', SIDE_HEADINGS[side]);
}

function surfaceUnder(map: TerrainMap, x: number, z: number): TileSurface | null {
  const column: number = Math.floor(x / map.cellSize);
  const row: number = Math.floor(z / map.cellSize);
  if (column < 0 || row < 0 || column >= map.columns || row >= map.rows) return null;
  return map.surfaces[row * map.columns + column] ?? null;
}

function stairProblem(map: TerrainMap | null, placed: PlacedStair, local: RiseSide): string | null {
  const at: string = `${placed.prop} at ${placed.x}, ${placed.z}`;
  const surface: TileSurface | null = map === null ? null : surfaceUnder(map, placed.x, placed.z);
  if (surface === null || surface.kind !== 'ramp') return `${at} climbs, so it stands on a ramp, not on ${surface === null ? 'no terrain' : 'flat ground'}`;
  const wanted: RiseSide = rampRise(surface.axis, surface.to > surface.from);
  const facing: ReadonlyVec2 = risesToward(local, placed.rotationDegrees);
  const toward: ReadonlyVec2 = sideVector(wanted);
  if (facing.x * toward.x + facing.z * toward.z >= STAIR_RISE.aligned) return null;
  return `${at} turned ${placed.rotationDegrees}° climbs away from the ramp's high end at ${wanted}; turn it ${turnToRise(local, wanted)}°`;
}

export function stairProblems(map: TerrainMap | null, placed: readonly PlacedStair[], defs: ReadonlyMap<string, PropDef>): string[] {
  const problems: string[] = [];
  for (const piece of placed) {
    const local: RiseSide | null = defs.get(piece.prop)?.rises ?? null;
    if (local === null) continue;
    const problem: string | null = stairProblem(map, piece, local);
    if (problem !== null) problems.push(problem);
  }
  return problems;
}
