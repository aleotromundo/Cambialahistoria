import type { Content, PropDef, ZoneDef, ZoneProp } from '../content/types.ts';
import type { NavGrid } from '../nav/grid.ts';
import { buildNavGrid, cellIndex, propBlockers } from '../nav/grid.ts';
import { distanceField } from './zone-gaps.ts';

export const FIGHT_FLOOR = {
  wall: 2.5,
} as const;

export interface FloorClutter {
  readonly at: number;
  readonly placed: ZoneProp;
  readonly fromWall: number;
}

export interface WallReach {
  readonly grid: NavGrid;
  readonly fromWall: Float64Array;
}

export function wallReach(zone: ZoneDef, content: Content): WallReach {
  const grid: NavGrid = buildNavGrid({ ...zone, props: [] }, content.props, content.surfaces, content.player.radius);
  const walls: Uint8Array = Uint8Array.from(grid.ground, (ground: number): number => (ground === 1 ? 0 : 1));
  const cells: Float64Array = distanceField(walls, grid.columns, grid.rows);
  return { grid, fromWall: cells.map((gap: number): number => gap * grid.cellSize) };
}

export function distanceFromWall(reach: WallReach, x: number, z: number): number {
  const index: number = cellIndex(reach.grid, x, z);
  return index < 0 ? 0 : (reach.fromWall[index] ?? 0);
}

function blocks(def: PropDef, placed: ZoneProp): boolean {
  return propBlockers(def, placed.x, placed.z, placed.rotationDegrees).length > 0;
}

export function clutterOnFightFloor(zone: ZoneDef, content: Content, clutter: ReadonlySet<string>): FloorClutter[] {
  if (!zone.props.some((placed: ZoneProp): boolean => clutter.has(placed.prop))) return [];
  const reach: WallReach = wallReach(zone, content);
  return zone.props.flatMap((placed: ZoneProp, at: number): FloorClutter[] => {
    const def: PropDef | undefined = content.props.get(placed.prop);
    if (def === undefined || !clutter.has(placed.prop) || placed.y > 0 || !blocks(def, placed)) return [];
    const fromWall: number = distanceFromWall(reach, placed.x, placed.z);
    return fromWall > FIGHT_FLOOR.wall ? [{ at, placed, fromWall }] : [];
  });
}
