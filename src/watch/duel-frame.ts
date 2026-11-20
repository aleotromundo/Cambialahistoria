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

export function duelReach(a: GroundSpot, b: GroundSpot, aim: GroundSpot, view: FrameView, ground: GroundHeight): number {
  const axes: Axes = axesOf(view);
  const tanHigh: number = Math.tan(radians(view.fovDegrees) / 2);
  const tanWide: number = tanHigh * Math.max(1e-3, view.aspect);
  const rooms: Rooms = roomsOf(view);
  const look: number = ground(aim.x, aim.z) + view.lookHeight;
  let reach: number = DUEL_FRAME.nearest;
  for (const spot of [a, b]) {
    const floor: number = ground(spot.x, spot.z);
    for (const height of [0, DUEL_FRAME.headHeight]) reach = Math.max(reach, reachFor(axes, rooms, spot.x - aim.x, floor + height - look, spot.z - aim.z, tanWide, tanHigh));
  }
  return Math.min(DUEL_FRAME.farthest, reach);
}

export function duelShot(a: GroundSpot, b: GroundSpot, view: FrameView, ground: GroundHeight): DuelShot {
  const aim: GroundSpot = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  return { x: aim.x, z: aim.z, distance: duelReach(a, b, aim, view, ground) };
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
  return { x: { value: 0, speed: 0 }, z: { value: 0, speed: 0 }, distance: { value: DUEL_FRAME.nearest, speed: 0 }, started: false };
}

export function stepDuelFraming(framing: DuelFraming, a: GroundSpot, b: GroundSpot, view: FrameView, ground: GroundHeight, dt: number): DuelShot {
  const wanted: DuelShot = duelShot(a, b, view, ground);
  if (!framing.started) {
    framing.x = { value: wanted.x, speed: 0 };
    framing.z = { value: wanted.z, speed: 0 };
    framing.distance = { value: wanted.distance, speed: 0 };
    framing.started = true;
    return wanted;
  }
  framing.x = glideTo(framing.x, wanted.x, DUEL_FRAME.aimRate, dt);
  framing.z = glideTo(framing.z, wanted.z, DUEL_FRAME.aimRate, dt);
  const reach: number = duelReach(a, b, { x: framing.x.value, z: framing.z.value }, view, ground);
  const zoomRate: number = reach > framing.distance.value ? DUEL_FRAME.zoomOutRate : DUEL_FRAME.zoomInRate;
  framing.distance = glideTo(framing.distance, reach, zoomRate, dt);
  return { x: framing.x.value, z: framing.z.value, distance: framing.distance.value };
}
