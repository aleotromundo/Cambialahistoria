import type { PropClimb, PropDef, ZoneDef } from '../content/types.ts';
import { heightAt } from './terrain.ts';
import { zoneCache, type ZoneCache } from '../zone-cache.ts';

export const CLIMB = {
  band: 0.32,
} as const;

export interface PlacedClimb {
  readonly x: number;
  readonly z: number;
  readonly base: number;
  readonly cos: number;
  readonly sin: number;
  readonly scale: number;
  readonly reach: number;
  readonly climb: PropClimb;
}

const PLACED: ZoneCache<readonly PlacedClimb[]> = zoneCache<readonly PlacedClimb[]>('climbs');

export function zoneClimbs(zone: ZoneDef, props: ReadonlyMap<string, PropDef>): readonly PlacedClimb[] {
  const known: readonly PlacedClimb[] | undefined = PLACED.get(zone);
  if (known !== undefined) return known;
  const made: PlacedClimb[] = [];
  for (const placed of zone.props) {
    if (placed.when.length > 0) continue;
    const def: PropDef | undefined = props.get(placed.prop);
    if (def === undefined || def.climb === null) continue;
    const angle: number = (placed.rotationDegrees * Math.PI) / 180;
    const run: number = def.climb.steps * def.climb.depth;
    made.push({
      x: placed.x,
      z: placed.z,
      base: heightAt(zone, placed.x, placed.z) + placed.y,
      cos: Math.cos(angle),
      sin: Math.sin(angle),
      scale: def.scale,
      reach: Math.hypot(def.climb.width / 2, run / 2 + CLIMB.band) * def.scale,
      climb: def.climb,
    });
  }
  PLACED.set(zone, made);
  return made;
}

function eased(share: number): number {
  const t: number = Math.min(1, Math.max(0, share));
  return t * t * (3 - 2 * t);
}

export function treadHeight(climb: PropClimb, across: number, along: number): number | null {
  if (Math.abs(across) > climb.width / 2) return null;
  const run: number = climb.steps * climb.depth;
  const climbed: number = run / 2 - along;
  const band: number = Math.min(CLIMB.band, climb.depth / 2);
  if (climbed < -band || climbed > run) return null;
  if (climbed < 0) return climb.rise * eased((climbed + band) / band);
  const tread: number = Math.min(climb.steps - 1, Math.floor(climbed / climb.depth));
  const below: number = (tread + 1) * climb.rise;
  if (tread === climb.steps - 1) return below;
  return below + climb.rise * eased((climbed - ((tread + 1) * climb.depth - band)) / band);
}

export function climbOn(placed: PlacedClimb, x: number, z: number): number | null {
  const dx: number = x - placed.x;
  const dz: number = z - placed.z;
  if (Math.abs(dx) > placed.reach || Math.abs(dz) > placed.reach) return null;
  const across: number = (dx * placed.cos - dz * placed.sin) / placed.scale;
  const along: number = (dx * placed.sin + dz * placed.cos) / placed.scale;
  const tread: number | null = treadHeight(placed.climb, across, along);
  return tread === null ? null : placed.base + tread * placed.scale;
}

export function standHeight(zone: ZoneDef, props: ReadonlyMap<string, PropDef>, x: number, z: number): number {
  let height: number = heightAt(zone, x, z);
  for (const placed of zoneClimbs(zone, props)) {
    const on: number | null = climbOn(placed, x, z);
    if (on !== null && on > height) height = on;
  }
  return height;
}
