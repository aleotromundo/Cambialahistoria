import type { BufferAttribute, BufferGeometry, Camera, GeometryGroup, InterleavedBufferAttribute, Material, Object3D, ToneMapping } from 'three';
import { BatchedMesh, InstancedMesh, MeshLambertMaterial, MeshPhongMaterial, MeshStandardMaterial, NoToneMapping, Scene, SkinnedMesh } from 'three';

export const PROGRAM_CHANGES = {
  lineageDepth: 3,
} as const;

export const PROGRAM_CHANGE_REASONS = [
  'version', 'batching', 'batchingColor', 'instancing', 'instancingColor', 'skinning', 'fog', 'environment',
  'vertexAlphas', 'vertexTangents', 'morphTargets', 'morphTargetsCount', 'toneMapping', 'lights', 'unknown',
] as const;

export type ProgramChangeReason = typeof PROGRAM_CHANGE_REASONS[number];

export interface CompiledProgramState {
  readonly version: number;
  readonly batching: boolean;
  readonly batchingColor: boolean;
  readonly instancing: boolean;
  readonly instancingColor: boolean;
  readonly skinning: boolean;
  readonly fog: unknown;
  readonly environment: unknown;
  readonly vertexAlphas: boolean;
  readonly vertexTangents: boolean;
  readonly morphTargets: boolean;
  readonly morphTargetsCount: number;
  readonly toneMapping: number;
}

export interface DrawNeeds extends CompiledProgramState {
  readonly usesFog: boolean;
}

export type DrawCall = (camera: Camera, scene: Scene, geometry: BufferGeometry, material: Material, object: Object3D, group: GeometryGroup) => void;

export interface DrawTarget {
  readonly toneMapping: ToneMapping;
  getRenderTarget(): unknown;
}

export interface ProgramChangeRenderer extends DrawTarget {
  readonly properties: { get(object: object): unknown };
  renderBufferDirect: DrawCall;
}

export type DrawSurface = 'canvas' | 'target';

export interface ProgramChangeCount {
  readonly reason: ProgramChangeReason;
  readonly material: string;
  readonly object: string;
  readonly surface: DrawSurface;
  count: number;
}

export interface ProgramChangeTally {
  draws: number;
  changedDraws: number;
  readonly counts: Map<string, ProgramChangeCount>;
}

export interface ProgramChangeWatch {
  readonly tally: ProgramChangeTally;
  stop(): ProgramChangeTally;
}

export interface ProgramChangeRow {
  readonly reason: ProgramChangeReason;
  readonly material: string;
  readonly object: string;
  readonly surface: DrawSurface;
  readonly perFrame: number;
}

export interface ReasonRate {
  readonly reason: ProgramChangeReason;
  readonly perFrame: number;
}

export interface ProgramChangeReport {
  readonly frames: number;
  readonly drawsPerFrame: number;
  readonly changedDrawsPerFrame: number;
  readonly byReason: readonly ReasonRate[];
  readonly rows: readonly ProgramChangeRow[];
}

type Attribute = BufferAttribute | InterleavedBufferAttribute;

function field(record: unknown, key: string): unknown {
  return typeof record === 'object' && record !== null ? Reflect.get(record, key) : undefined;
}

function flag(record: unknown, key: string): boolean {
  return field(record, key) === true;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

export function compiledProgramState(properties: unknown): CompiledProgramState | null {
  const version: unknown = field(properties, '__version');
  if (typeof version !== 'number') return null;
  return {
    version,
    batching: flag(properties, 'batching'),
    batchingColor: flag(properties, 'batchingColor'),
    instancing: flag(properties, 'instancing'),
    instancingColor: flag(properties, 'instancingColor'),
    skinning: flag(properties, 'skinning'),
    fog: field(properties, 'fog') ?? null,
    environment: field(properties, 'environment') ?? null,
    vertexAlphas: flag(properties, 'vertexAlphas'),
    vertexTangents: flag(properties, 'vertexTangents'),
    morphTargets: flag(properties, 'morphTargets'),
    morphTargetsCount: numberOr(field(properties, 'morphTargetsCount'), 0),
    toneMapping: numberOr(field(properties, 'toneMapping'), NoToneMapping),
  };
}

function takesSceneEnvironment(material: Material): boolean {
  return material instanceof MeshStandardMaterial || material instanceof MeshLambertMaterial || material instanceof MeshPhongMaterial;
}

function morphList(geometry: BufferGeometry, key: 'position' | 'normal' | 'color'): readonly Attribute[] | undefined {
  return geometry.morphAttributes[key];
}

export function drawNeeds(target: DrawTarget, scene: unknown, geometry: BufferGeometry, material: Material, object: Object3D): DrawNeeds {
  const drawnScene: Scene | null = scene instanceof Scene ? scene : null;
  const alphaColours: boolean = geometry.hasAttribute('color') && geometry.getAttribute('color').itemSize === 4;
  const positions: readonly Attribute[] | undefined = morphList(geometry, 'position');
  const morphed: readonly Attribute[] | undefined = positions ?? morphList(geometry, 'normal') ?? morphList(geometry, 'color');
  const batching: boolean = object instanceof BatchedMesh;
  const instancing: boolean = object instanceof InstancedMesh;
  const instanceColour: boolean = object instanceof InstancedMesh && object.instanceColor !== null;
  const normalMap: unknown = field(material, 'normalMap');
  const normalMapped: boolean = normalMap !== null && normalMap !== undefined;
  return {
    version: material.version,
    batching,
    batchingColor: batching && field(object, '_colorsTexture') !== null,
    instancing,
    instancingColor: instanceColour,
    skinning: object instanceof SkinnedMesh,
    usesFog: flag(material, 'fog'),
    fog: drawnScene === null ? null : drawnScene.fog,
    environment: drawnScene !== null && takesSceneEnvironment(material) ? drawnScene.environment : null,
    vertexAlphas: material.vertexColors && alphaColours,
    vertexTangents: geometry.hasAttribute('tangent') && (normalMapped || numberOr(field(material, 'anisotropy'), 0) > 0),
    morphTargets: positions !== undefined,
    morphTargetsCount: morphed === undefined ? 0 : morphed.length,
    toneMapping: material.toneMapped && target.getRenderTarget() === null ? target.toneMapping : NoToneMapping,
  };
}

export function programChangeReasons(needs: DrawNeeds, compiled: CompiledProgramState): ProgramChangeReason[] {
  if (needs.version !== compiled.version) return ['version'];
  const reasons: ProgramChangeReason[] = [];
  if (needs.batching !== compiled.batching) reasons.push('batching');
  if (needs.batching && needs.batchingColor !== compiled.batchingColor) reasons.push('batchingColor');
  if (needs.instancing !== compiled.instancing) reasons.push('instancing');
  if (needs.instancing && needs.instancingColor !== compiled.instancingColor) reasons.push('instancingColor');
  if (needs.skinning !== compiled.skinning) reasons.push('skinning');
  if (needs.usesFog && needs.fog !== compiled.fog) reasons.push('fog');
  if (needs.environment !== compiled.environment) reasons.push('environment');
  if (needs.vertexAlphas !== compiled.vertexAlphas) reasons.push('vertexAlphas');
  if (needs.vertexTangents !== compiled.vertexTangents) reasons.push('vertexTangents');
  if (needs.morphTargets !== compiled.morphTargets) reasons.push('morphTargets');
  if (needs.morphTargetsCount !== compiled.morphTargetsCount) reasons.push('morphTargetsCount');
  if (needs.toneMapping !== compiled.toneMapping) reasons.push('toneMapping');
  return reasons;
}

function kindOf(object: Object3D): string {
  return object instanceof InstancedMesh ? 'InstancedMesh' : object.type;
}

function labelOf(object: Object3D): string {
  return object.name === '' ? kindOf(object) : `${kindOf(object)} "${object.name}"`;
}

export function lineageOf(object: Object3D): string {
  const names: string[] = [];
  for (let ancestor: Object3D | null = object.parent; ancestor !== null && names.length < PROGRAM_CHANGES.lineageDepth; ancestor = ancestor.parent) names.push(labelOf(ancestor));
  return names.length === 0 ? labelOf(object) : `${labelOf(object)} under ${names.join(' < ')}`;
}

export function materialLabel(material: Material): string {
  return `${material.type} "${material.name}" #${numberOr(field(material, 'id'), 0)}`;
}

interface SharedWatch {
  readonly draw: DrawCall;
  readonly watched: DrawCall;
  readonly tallies: Set<ProgramChangeTally>;
}

const sharedWatches: WeakMap<ProgramChangeRenderer, SharedWatch> = new WeakMap<ProgramChangeRenderer, SharedWatch>();

function noteChange(tally: ProgramChangeTally, reason: ProgramChangeReason, material: Material, object: Object3D, surface: DrawSurface): void {
  const key: string = `${reason}|${material.uuid}|${object.id}|${surface}`;
  const known: ProgramChangeCount | undefined = tally.counts.get(key);
  if (known === undefined) tally.counts.set(key, { reason, material: materialLabel(material), object: lineageOf(object), surface, count: 1 });
  else known.count += 1;
}

function tallyDraw(tallies: ReadonlySet<ProgramChangeTally>, reasons: readonly ProgramChangeReason[], material: Material, object: Object3D, surface: DrawSurface): void {
  for (const tally of tallies) {
    tally.draws += 1;
    if (reasons.length === 0) continue;
    tally.changedDraws += 1;
    for (const reason of reasons) noteChange(tally, reason, material, object, surface);
  }
}

function sharedWatchOf(renderer: ProgramChangeRenderer): SharedWatch {
  const known: SharedWatch | undefined = sharedWatches.get(renderer);
  if (known !== undefined) return known;
  const draw: DrawCall = renderer.renderBufferDirect;
  const tallies: Set<ProgramChangeTally> = new Set<ProgramChangeTally>();
  const watched: DrawCall = (camera: Camera, scene: Scene, geometry: BufferGeometry, material: Material, object: Object3D, group: GeometryGroup): void => {
    const properties: unknown = tallies.size > 0 ? renderer.properties.get(material) : null;
    const compiled: CompiledProgramState | null = compiledProgramState(properties);
    if (compiled === null) {
      draw.call(renderer, camera, scene, geometry, material, object, group);
      return;
    }
    const reasons: ProgramChangeReason[] = programChangeReasons(drawNeeds(renderer, scene, geometry, material, object), compiled);
    const surface: DrawSurface = renderer.getRenderTarget() === null ? 'canvas' : 'target';
    const lightsBefore: unknown = field(properties, 'lightsStateVersion');
    const programBefore: unknown = field(properties, 'currentProgram');
    draw.call(renderer, camera, scene, geometry, material, object, group);
    if (reasons.length === 0 && field(properties, 'lightsStateVersion') !== lightsBefore) reasons.push('lights');
    if (reasons.length === 0 && field(properties, 'currentProgram') !== programBefore) reasons.push('unknown');
    tallyDraw(tallies, reasons, material, object, surface);
  };
  const shared: SharedWatch = { draw, watched, tallies };
  renderer.renderBufferDirect = watched;
  sharedWatches.set(renderer, shared);
  return shared;
}

export function watchProgramChanges(renderer: ProgramChangeRenderer): ProgramChangeWatch {
  const tally: ProgramChangeTally = { draws: 0, changedDraws: 0, counts: new Map<string, ProgramChangeCount>() };
  const shared: SharedWatch = sharedWatchOf(renderer);
  shared.tallies.add(tally);
  return {
    tally,
    stop(): ProgramChangeTally {
      shared.tallies.delete(tally);
      if (shared.tallies.size > 0 || renderer.renderBufferDirect !== shared.watched) return tally;
      renderer.renderBufferDirect = shared.draw;
      sharedWatches.delete(renderer);
      return tally;
    },
  };
}

export function programChangeReport(tally: ProgramChangeTally, frames: number): ProgramChangeReport {
  const perFrame = (count: number): number => (frames > 0 ? count / frames : 0);
  const totals: Map<ProgramChangeReason, number> = new Map<ProgramChangeReason, number>();
  for (const entry of tally.counts.values()) totals.set(entry.reason, (totals.get(entry.reason) ?? 0) + entry.count);
  return {
    frames,
    drawsPerFrame: perFrame(tally.draws),
    changedDrawsPerFrame: perFrame(tally.changedDraws),
    byReason: [...totals].toSorted((a: [ProgramChangeReason, number], b: [ProgramChangeReason, number]): number => b[1] - a[1]).map(([reason, count]: [ProgramChangeReason, number]): ReasonRate => ({ reason, perFrame: perFrame(count) })),
    rows: [...tally.counts.values()].toSorted((a: ProgramChangeCount, b: ProgramChangeCount): number => b.count - a.count).map((entry: ProgramChangeCount): ProgramChangeRow => ({ reason: entry.reason, material: entry.material, object: entry.object, surface: entry.surface, perFrame: perFrame(entry.count) })),
  };
}

export function formatProgramChanges(report: ProgramChangeReport, topRows: number): string {
  const head: string = `program changes: ${report.changedDrawsPerFrame.toFixed(1)} of ${report.drawsPerFrame.toFixed(0)} draws per frame over ${report.frames} frames`;
  const reasons: string = report.byReason.map((rate: ReasonRate): string => `${rate.reason} ${rate.perFrame.toFixed(1)}`).join(', ');
  const rows: string[] = report.rows.slice(0, topRows).map((row: ProgramChangeRow): string => `  ${row.perFrame.toFixed(2)}/frame ${row.reason}: ${row.material} on ${row.object}, drawn to ${row.surface === 'canvas' ? 'the canvas' : 'a render target'}`);
  return [reasons === '' ? head : `${head} (${reasons})`, ...rows].join('\n');
}
