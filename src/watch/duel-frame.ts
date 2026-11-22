import { CAMERA } from '../render/iso-camera.ts';

export const DUEL_FRAME = {
  nearest: 28,
  farthest: 84,
  keepSide: 0.14,
  keepTop: 0.08,
  keepBottom: 0.14,
  leastRoom: 0.2,
  pad: 1.4,
  headHeight: 2.1,
  aimRate: 4.2,
  zoomOutRate: 6.5,
  zoomInRate: 1.6,
  settled: 1e-4,
  keepMargin: 4,
  keepSpacing: 1,
  keepGap: 0.75,
  keepEdge: 0.02,
  keepSearch: 10,
  keepPasses: 4,
  keepLead: 0.5,
  keepLeadMost: 4,
  keepLeadRate: 6,
} as const;

export interface GroundSpot {
  readonly x: number;
  readonly z: number;
}

export type GroundHeight = (x: number, z: number) => number;

export interface FrameView {
  readonly aspect: number;
  readonly fovDegrees: number;
  readonly yawDegrees: number;
  readonly pitchDegrees: number;
  readonly lookHeight: number;
  readonly topCover: number;
}

export interface ScreenBox {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
}

export interface FrameKeep {
  readonly covers: readonly ScreenBox[];
}

export interface FrameLens {
  readonly aspect: number;
  readonly fov: number;
}

export function lensView(lens: FrameLens, topCover: number): FrameView {
  return { aspect: lens.aspect, fovDegrees: lens.fov, yawDegrees: CAMERA.yawDegrees, pitchDegrees: CAMERA.pitchDegrees, lookHeight: CAMERA.lookHeight, topCover };
}

export interface DuelShot {
  readonly x: number;
  readonly z: number;
  readonly distance: number;
}

export interface Glide {
  readonly value: number;
  readonly speed: number;
}

export interface DuelFraming {
  x: Glide;
  z: Glide;
  distance: Glide;
  started: boolean;
  last: GroundSpot;
  lead: GroundSpot;
}

interface Axes {
  readonly rightX: number;
  readonly rightZ: number;
  readonly upX: number;
  readonly upY: number;
  readonly upZ: number;
  readonly forwardX: number;
  readonly forwardY: number;
  readonly forwardZ: number;
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function axesOf(view: FrameView): Axes {
  const yaw: number = radians(view.yawDegrees);
  const pitch: number = radians(view.pitchDegrees);
  return {
    rightX: Math.cos(yaw),
    rightZ: -Math.sin(yaw),
    upX: -Math.sin(pitch) * Math.sin(yaw),
    upY: Math.cos(pitch),
    upZ: -Math.sin(pitch) * Math.cos(yaw),
    forwardX: -Math.sin(yaw) * Math.cos(pitch),
    forwardY: -Math.sin(pitch),
    forwardZ: -Math.cos(yaw) * Math.cos(pitch),
  };
}

interface Rooms {
  readonly side: number;
  readonly top: number;
  readonly bottom: number;
}

function roomsOf(view: FrameView): Rooms {
  const cover: number = Math.min(1, Math.max(0, view.topCover));
  return {
    side: 1 - DUEL_FRAME.keepSide,
    top: Math.max(DUEL_FRAME.leastRoom, 1 - DUEL_FRAME.keepTop - cover),
    bottom: 1 - DUEL_FRAME.keepBottom,
  };
}

function reachFor(axes: Axes, rooms: Rooms, dx: number, dy: number, dz: number, tanWide: number, tanHigh: number): number {
  const across: number = Math.abs(dx * axes.rightX + dz * axes.rightZ) + DUEL_FRAME.pad;
  const upward: number = dx * axes.upX + dy * axes.upY + dz * axes.upZ;
  const ahead: number = dx * axes.forwardX + dy * axes.forwardY + dz * axes.forwardZ;
  const above: number = (upward + DUEL_FRAME.pad) / (tanHigh * rooms.top);
  const below: number = (DUEL_FRAME.pad - upward) / (tanHigh * rooms.bottom);
  return Math.max(across / (tanWide * rooms.side), above, below) - ahead;
}

interface Lens {
  readonly axes: Axes;
  readonly tanHigh: number;
  readonly tanWide: number;
  readonly look: number;
}

function lensAt(aim: GroundSpot, view: FrameView, ground: GroundHeight): Lens {
  const tanHigh: number = Math.tan(radians(view.fovDegrees) / 2);
  return { axes: axesOf(view), tanHigh, tanWide: tanHigh * Math.max(1e-3, view.aspect), look: ground(aim.x, aim.z) + view.lookHeight };
}

function bodyReach(spot: GroundSpot, aim: GroundSpot, lens: Lens, rooms: Rooms, ground: GroundHeight): number {
  const floor: number = ground(spot.x, spot.z);
  let reach: number = DUEL_FRAME.nearest;
  for (const height of [0, DUEL_FRAME.headHeight]) reach = Math.max(reach, reachFor(lens.axes, rooms, spot.x - aim.x, floor + height - lens.look, spot.z - aim.z, lens.tanWide, lens.tanHigh));
  return reach;
}

interface MarginPoint {
  readonly across: number;
  readonly upward: number;
  readonly ahead: number;
  readonly halfWide: number;
  readonly halfHigh: number;
}

interface Span {
  readonly from: number;
  readonly to: number;
}

function beyond(lowest: number, value: number, scaled: Span): Span | null {
  if (value > 0) return { from: Math.max(scaled.from, lowest / value), to: scaled.to };
  if (value < 0) return lowest < 0 ? { from: scaled.from, to: Math.min(scaled.to, lowest / value) } : null;
  return lowest < 0 ? scaled : null;
}

function overlapSpan(centre: number, half: number, low: number, high: number, scaled: Span): Span | null {
  const above: Span | null = beyond(low, centre + half, scaled);
  if (above === null) return null;
  return beyond(-high, half - centre, above);
}

function coverSpan(point: MarginPoint, box: ScreenBox): Span | null {
  const wide: Span | null = overlapSpan(point.across, point.halfWide, box.left, box.right, { from: 0, to: Number.POSITIVE_INFINITY });
  if (wide === null) return null;
  const high: Span | null = overlapSpan(point.upward, point.halfHigh, box.bottom, box.top, wide);
  return high !== null && high.from < high.to ? high : null;
}

function edgeScale(across: number, upward: number, rooms: Rooms): number {
  let scale: number = Number.POSITIVE_INFINITY;
  if (across !== 0) scale = Math.min(scale, rooms.side / Math.abs(across));
  if (upward > 0) scale = Math.min(scale, rooms.top / upward);
  if (upward < 0) scale = Math.min(scale, rooms.bottom / -upward);
  return scale;
}

function clearScale(point: MarginPoint, rooms: Rooms, covers: readonly ScreenBox[], start: number): number {
  let scale: number = Math.min(start, edgeScale(point.across, point.upward, rooms));
  for (let round: number = 0; round <= covers.length; round += 1) {
    let moved: boolean = false;
    for (const box of covers) {
      const span: Span | null = coverSpan(point, box);
      if (span === null || scale <= span.from || scale > span.to) continue;
      scale = span.from;
      moved = true;
    }
    if (!moved) return scale;
  }
  return scale;
}

function keepRooms(view: FrameView): Rooms {
  const cover: number = Math.min(1, Math.max(0, view.topCover));
  return { side: 1 - DUEL_FRAME.keepEdge, top: Math.max(DUEL_FRAME.leastRoom, 1 - DUEL_FRAME.keepEdge - cover), bottom: 1 - DUEL_FRAME.keepEdge };
}

function marginPoints(spot: GroundSpot, aim: GroundSpot, lens: Lens, ground: GroundHeight): MarginPoint[] {
  const { axes }: Lens = lens;
  const rings: number = Math.max(1, Math.ceil(DUEL_FRAME.keepMargin / DUEL_FRAME.keepSpacing));
  const gap: number = (DUEL_FRAME.keepGap * DUEL_FRAME.keepMargin) / rings;
  const halfWide: number = gap / lens.tanWide;
  const halfHigh: number = (gap * Math.hypot(axes.upX, axes.upZ)) / lens.tanHigh;
  const points: MarginPoint[] = [];
  for (let ring: number = 0; ring <= rings; ring += 1) {
    const radius: number = (DUEL_FRAME.keepMargin * ring) / rings;
    const count: number = Math.max(1, Math.ceil((Math.PI * 2 * radius) / DUEL_FRAME.keepSpacing));
    for (let point: number = 0; point < count; point += 1) {
      const turn: number = (point / count) * Math.PI * 2;
      const x: number = spot.x + Math.cos(turn) * radius;
      const z: number = spot.z + Math.sin(turn) * radius;
      const dx: number = x - aim.x;
      const dy: number = ground(x, z) - lens.look;
      const dz: number = z - aim.z;
      points.push({
        across: (dx * axes.rightX + dz * axes.rightZ) / lens.tanWide,
        upward: (dx * axes.upX + dy * axes.upY + dz * axes.upZ) / lens.tanHigh,
        ahead: dx * axes.forwardX + dy * axes.forwardY + dz * axes.forwardZ,
        halfWide,
        halfHigh,
      });
    }
  }
  return points;
}

interface Kept {
  readonly covers: readonly ScreenBox[];
  readonly spots: readonly GroundSpot[];
}

function marginReach(aim: GroundSpot, lens: Lens, view: FrameView, ground: GroundHeight, keep: Kept, least: number): number {
  const rooms: Rooms = keepRooms(view);
  const points: MarginPoint[] = keep.spots.flatMap((spot: GroundSpot): MarginPoint[] => marginPoints(spot, aim, lens, ground));
  let reach: number = least;
  for (let pass: number = 0; pass < DUEL_FRAME.keepPasses && reach <= DUEL_FRAME.farthest; pass += 1) {
    let next: number = reach;
    for (const point of points) {
      const scale: number = clearScale(point, rooms, keep.covers, 1 / Math.max(1e-6, reach + point.ahead));
      next = Math.max(next, scale > 0 ? 1 / scale - point.ahead : Number.POSITIVE_INFINITY);
      if (next > DUEL_FRAME.farthest) return next;
    }
    if (next === reach) return reach;
    reach = next;
  }
  return reach;
}

function keptReach(spot: GroundSpot, aim: GroundSpot, view: FrameView, ground: GroundHeight, keep: Kept): number {
  const lens: Lens = lensAt(aim, view, ground);
  return marginReach(aim, lens, view, ground, keep, bodyReach(spot, aim, lens, roomsOf(view), ground));
}

function keptOf(a: GroundSpot, keep: FrameKeep | null): Kept | null {
  return keep === null ? null : { covers: keep.covers, spots: [a] };
}

function reachFrom(a: GroundSpot, b: GroundSpot, aim: GroundSpot, view: FrameView, ground: GroundHeight, keep: Kept | null): number {
  const lens: Lens = lensAt(aim, view, ground);
  const rooms: Rooms = roomsOf(view);
  const bodies: number = Math.max(bodyReach(a, aim, lens, rooms, ground), bodyReach(b, aim, lens, rooms, ground));
  const reach: number = keep === null ? bodies : marginReach(aim, lens, view, ground, keep, bodies);
  return Math.min(DUEL_FRAME.farthest, reach);
}

export function duelReach(a: GroundSpot, b: GroundSpot, aim: GroundSpot, view: FrameView, ground: GroundHeight, keep: FrameKeep | null = null): number {
  return reachFrom(a, b, aim, view, ground, keptOf(a, keep));
}

function toward(from: GroundSpot, to: GroundSpot, share: number): GroundSpot {
  return { x: from.x + (to.x - from.x) * share, z: from.z + (to.z - from.z) * share };
}

function keptAim(a: GroundSpot, middle: GroundSpot, view: FrameView, ground: GroundHeight, keep: Kept): GroundSpot {
  const fits = (aim: GroundSpot): boolean => keptReach(a, aim, view, ground, keep) <= DUEL_FRAME.farthest;
  if (fits(middle)) return middle;
  const goal: GroundSpot = keep.spots.at(-1) ?? a;
  let low: number = 0;
  let high: number = 1;
  for (let step: number = 0; step < DUEL_FRAME.keepSearch; step += 1) {
    const share: number = (low + high) / 2;
    if (fits(toward(middle, goal, share))) high = share;
    else low = share;
  }
  return toward(middle, goal, high);
}

function shotFrom(a: GroundSpot, b: GroundSpot, view: FrameView, ground: GroundHeight, keep: Kept | null): DuelShot {
  const middle: GroundSpot = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  const aim: GroundSpot = keep === null ? middle : keptAim(a, middle, view, ground, keep);
  return { x: aim.x, z: aim.z, distance: reachFrom(a, b, aim, view, ground, keep) };
}

export function duelShot(a: GroundSpot, b: GroundSpot, view: FrameView, ground: GroundHeight, keep: FrameKeep | null = null): DuelShot {
  return shotFrom(a, b, view, ground, keptOf(a, keep));
}

function leadOf(framing: DuelFraming, a: GroundSpot, dt: number): GroundSpot {
  if (!framing.started || dt <= 0) return framing.lead;
  const dx: number = ((a.x - framing.last.x) / dt) * DUEL_FRAME.keepLead;
  const dz: number = ((a.z - framing.last.z) / dt) * DUEL_FRAME.keepLead;
  const length: number = Math.hypot(dx, dz);
  const share: number = length > DUEL_FRAME.keepLeadMost ? DUEL_FRAME.keepLeadMost / length : 1;
  const ease: number = 1 - Math.exp(-DUEL_FRAME.keepLeadRate * dt);
  return { x: framing.lead.x + (dx * share - framing.lead.x) * ease, z: framing.lead.z + (dz * share - framing.lead.z) * ease };
}

export function glideTo(glide: Glide, target: number, rate: number, dt: number): Glide {
  if (dt <= 0) return glide;
  const offset: number = glide.value - target;
  const push: number = (glide.speed + rate * offset) * dt;
  const fade: number = Math.exp(-rate * dt);
  const value: number = target + (offset + push) * fade;
  const speed: number = (glide.speed - rate * push) * fade;
  if (Math.abs(value - target) < DUEL_FRAME.settled && Math.abs(speed) < DUEL_FRAME.settled) return { value: target, speed: 0 };
  return { value, speed };
}

export function createDuelFraming(): DuelFraming {
  return { x: { value: 0, speed: 0 }, z: { value: 0, speed: 0 }, distance: { value: DUEL_FRAME.nearest, speed: 0 }, started: false, last: { x: 0, z: 0 }, lead: { x: 0, z: 0 } };
}

export function stepDuelFraming(framing: DuelFraming, a: GroundSpot, b: GroundSpot, view: FrameView, ground: GroundHeight, dt: number, keep: FrameKeep | null = null): DuelShot {
  framing.lead = leadOf(framing, a, dt);
  framing.last = { x: a.x, z: a.z };
  const ahead: GroundSpot = { x: a.x + framing.lead.x, z: a.z + framing.lead.z };
  const led: Kept | null = keep === null ? null : { covers: keep.covers, spots: Math.hypot(framing.lead.x, framing.lead.z) < DUEL_FRAME.settled ? [a] : [a, ahead] };
  const wanted: DuelShot = shotFrom(a, b, view, ground, led);
  if (!framing.started) {
    framing.x = { value: wanted.x, speed: 0 };
    framing.z = { value: wanted.z, speed: 0 };
    framing.distance = { value: wanted.distance, speed: 0 };
    framing.started = true;
    return wanted;
  }
  framing.x = glideTo(framing.x, wanted.x, DUEL_FRAME.aimRate, dt);
  framing.z = glideTo(framing.z, wanted.z, DUEL_FRAME.aimRate, dt);
  const reach: number = reachFrom(a, b, { x: framing.x.value, z: framing.z.value }, view, ground, led);
  const zoomRate: number = reach > framing.distance.value ? DUEL_FRAME.zoomOutRate : DUEL_FRAME.zoomInRate;
  framing.distance = glideTo(framing.distance, reach, zoomRate, dt);
  return { x: framing.x.value, z: framing.z.value, distance: framing.distance.value };
}
