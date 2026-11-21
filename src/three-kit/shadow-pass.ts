import type { BufferGeometry, Camera, GeometryGroup, Light, Material, Object3D, Scene } from 'three';
import { BatchedMesh, InstancedMesh, LightShadow, SkinnedMesh } from 'three';
import type { DrawCall } from './program-changes.ts';

export const SHADOW_CASTER_KINDS = ['still', 'moved', 'skinned', 'instanced'] as const;

export type ShadowCasterKind = typeof SHADOW_CASTER_KINDS[number];

export type ShadowRender = (lights: Light[], scene: Scene, camera: Camera) => void;

export interface DrawCounts {
  readonly calls: number;
  readonly triangles: number;
}

export interface ShadowPassRenderer {
  renderBufferDirect: DrawCall;
  readonly shadowMap: { readonly enabled: boolean; render: ShadowRender };
  readonly info: { readonly render: DrawCounts };
}

export interface KindTally {
  draws: number;
  triangles: number;
}

export interface ShadowPassTally {
  passes: number;
  movedPasses: number;
  draws: number;
  triangles: number;
  allDraws: number;
  allTriangles: number;
  readonly kinds: Record<ShadowCasterKind, KindTally>;
}

export interface ShadowPassWatch {
  readonly tally: ShadowPassTally;
  stop(): ShadowPassTally;
}

export interface ShadowKindRate {
  readonly kind: ShadowCasterKind;
  readonly drawsPerFrame: number;
  readonly trianglesPerFrame: number;
}

export interface ShadowPassReport {
  readonly frames: number;
  readonly passesPerFrame: number;
  readonly movedPassShare: number;
  readonly drawsPerFrame: number;
  readonly trianglesPerFrame: number;
  readonly allDrawsPerFrame: number;
  readonly allTrianglesPerFrame: number;
  readonly kinds: readonly ShadowKindRate[];
}

interface Placement {
  pass: number;
  moved: boolean;
  readonly elements: number[];
}

export function emptyShadowPassTally(): ShadowPassTally {
  return {
    passes: 0,
    movedPasses: 0,
    draws: 0,
    triangles: 0,
    allDraws: 0,
    allTriangles: 0,
    kinds: { still: { draws: 0, triangles: 0 }, moved: { draws: 0, triangles: 0 }, skinned: { draws: 0, triangles: 0 }, instanced: { draws: 0, triangles: 0 } },
  };
}

function sameElements(kept: readonly number[], now: readonly number[]): boolean {
  for (let index: number = 0; index < now.length; index += 1) if (kept[index] !== now[index]) return false;
  return true;
}

function movedSince(placements: WeakMap<Object3D, Placement>, object: Object3D, pass: number): boolean {
  const now: readonly number[] = object.matrixWorld.elements;
  const kept: Placement | undefined = placements.get(object);
  if (kept === undefined) {
    placements.set(object, { pass, moved: false, elements: [...now] });
    return false;
  }
  if (kept.pass === pass) return kept.moved;
  kept.moved = !sameElements(kept.elements, now);
  kept.pass = pass;
  for (let index: number = 0; index < now.length; index += 1) kept.elements[index] = now[index] ?? 0;
  return kept.moved;
}

function casterKind(placements: WeakMap<Object3D, Placement>, object: Object3D, pass: number): ShadowCasterKind {
  if (object instanceof SkinnedMesh) return 'skinned';
  if (object instanceof InstancedMesh || object instanceof BatchedMesh) return 'instanced';
  return movedSince(placements, object, pass) ? 'moved' : 'still';
}

function shadowsMoved(views: WeakMap<object, number[]>, lights: readonly Light[]): boolean {
  let moved: boolean = false;
  for (const light of lights) {
    const shadow: unknown = Reflect.get(light, 'shadow');
    if (!(shadow instanceof LightShadow)) continue;
    const now: readonly number[] = shadow.matrix.elements;
    const kept: number[] | undefined = views.get(shadow);
    if (kept === undefined) {
      views.set(shadow, [...now]);
      continue;
    }
    if (sameElements(kept, now)) continue;
    moved = true;
    for (let index: number = 0; index < now.length; index += 1) kept[index] = now[index] ?? 0;
  }
  return moved;
}

export function watchShadowPass(renderer: ShadowPassRenderer): ShadowPassWatch {
  const tally: ShadowPassTally = emptyShadowPassTally();
  const draw: DrawCall = renderer.renderBufferDirect;
  const render: ShadowRender = renderer.shadowMap.render;
  const placements: WeakMap<Object3D, Placement> = new WeakMap<Object3D, Placement>();
  const views: WeakMap<object, number[]> = new WeakMap<object, number[]>();
  const state: { active: boolean; pass: number | null } = { active: true, pass: null };
  const watchedDraw: DrawCall = (camera: Camera, scene: Scene, geometry: BufferGeometry, material: Material, object: Object3D, group: GeometryGroup): void => {
    if (!state.active) {
      draw.call(renderer, camera, scene, geometry, material, object, group);
      return;
    }
    const pass: number | null = state.pass;
    const calls: number = renderer.info.render.calls;
    const triangles: number = renderer.info.render.triangles;
    draw.call(renderer, camera, scene, geometry, material, object, group);
    const drawn: number = renderer.info.render.calls - calls;
    const shaded: number = renderer.info.render.triangles - triangles;
    tally.allDraws += drawn;
    tally.allTriangles += shaded;
    if (pass === null) return;
    const kind: KindTally = tally.kinds[casterKind(placements, object, pass)];
    kind.draws += drawn;
    kind.triangles += shaded;
    tally.draws += drawn;
    tally.triangles += shaded;
  };
  const watchedRender: ShadowRender = (lights: Light[], scene: Scene, camera: Camera): void => {
    if (!state.active || state.pass !== null || lights.length === 0 || !renderer.shadowMap.enabled) {
      render.call(renderer.shadowMap, lights, scene, camera);
      return;
    }
    state.pass = tally.passes;
    try {
      render.call(renderer.shadowMap, lights, scene, camera);
    } finally {
      state.pass = null;
    }
    tally.passes += 1;
    if (shadowsMoved(views, lights)) tally.movedPasses += 1;
  };
  renderer.renderBufferDirect = watchedDraw;
  renderer.shadowMap.render = watchedRender;
  return {
    tally,
    stop(): ShadowPassTally {
      state.active = false;
      if (renderer.renderBufferDirect === watchedDraw) renderer.renderBufferDirect = draw;
      if (renderer.shadowMap.render === watchedRender) renderer.shadowMap.render = render;
      return tally;
    },
  };
}

export function shadowPassReport(tally: ShadowPassTally, frames: number): ShadowPassReport {
  const perFrame = (count: number): number => (frames > 0 ? count / frames : 0);
  return {
    frames,
    passesPerFrame: perFrame(tally.passes),
    movedPassShare: tally.passes > 0 ? tally.movedPasses / tally.passes : 0,
    drawsPerFrame: perFrame(tally.draws),
    trianglesPerFrame: perFrame(tally.triangles),
    allDrawsPerFrame: perFrame(tally.allDraws),
    allTrianglesPerFrame: perFrame(tally.allTriangles),
    kinds: SHADOW_CASTER_KINDS.map((kind: ShadowCasterKind): ShadowKindRate => ({ kind, drawsPerFrame: perFrame(tally.kinds[kind].draws), trianglesPerFrame: perFrame(tally.kinds[kind].triangles) })),
  };
}
