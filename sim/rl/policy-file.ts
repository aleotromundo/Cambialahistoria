import type { Fields } from '../content/read.ts';
import { ContentError, each, fields, items, numeric, text } from '../content/read.ts';
import type { ObservationLayout } from './contract.ts';
import { contractShape } from './contract.ts';

export const POLICY_FILE = {
  magic: 'LSPL',
  format: 1,
  dtype: 'float16',
  lengthBytes: 4,
  halfBytes: 2,
  kinds: 3,
  feedForward: 2,
} as const;

const HALF = {
  signBit: 0x8000,
  exponentShift: 10,
  exponentMask: 0x1f,
  fractionMask: 0x3ff,
  fractionScale: 1024,
  bias: 15,
  subnormalScale: 2 ** -24,
  infinite: 0x1f,
} as const;

export interface PolicyTensor {
  readonly name: string;
  readonly shape: readonly number[];
  readonly values: Float32Array;
}

export interface PolicyContract {
  readonly version: number;
  readonly fingerprint: string;
  readonly layout: ObservationLayout;
  readonly heads: readonly number[];
}

export interface PolicyFile {
  readonly contract: PolicyContract;
  readonly width: number;
  readonly layers: number;
  readonly attentionHeads: number;
  readonly tensors: ReadonlyMap<string, PolicyTensor>;
  readonly update: number | null;
}

interface Listed {
  readonly name: string;
  readonly shape: readonly number[];
}

export function halfToFloat(bits: number): number {
  const sign: number = (bits & HALF.signBit) === 0 ? 1 : -1;
  const exponent: number = (bits >> HALF.exponentShift) & HALF.exponentMask;
  const fraction: number = bits & HALF.fractionMask;
  if (exponent === 0) return sign * fraction * HALF.subnormalScale;
  if (exponent === HALF.infinite) return fraction === 0 ? sign * Infinity : NaN;
  return sign * (1 + fraction / HALF.fractionScale) * 2 ** (exponent - HALF.bias);
}

function whole(source: Fields, key: string, where: string): number {
  const value: number = numeric(source, key, where);
  if (!Number.isInteger(value) || value < 0) throw new ContentError(`${where}.${key}`, 'expected a whole number');
  return value;
}

function readLayout(raw: unknown): ObservationLayout {
  const source: Fields = fields(raw, 'policy contract layout');
  const where: string = 'policy contract layout';
  return { self: whole(source, 'self', where), slot: whole(source, 'slot', where), slots: whole(source, 'slots', where), entity: whole(source, 'entity', where), entities: whole(source, 'entities', where), rays: whole(source, 'rays', where), size: whole(source, 'size', where), mask: whole(source, 'mask', where) };
}

function readContract(raw: unknown): PolicyContract {
  const source: Fields = fields(raw, 'policy contract');
  const heads: number[] = each(source['heads'], 'policy contract heads', (entry: unknown, where: string): number => {
    if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 1) throw new ContentError(where, 'expected a whole number of choices');
    return entry;
  });
  return { version: whole(source, 'version', 'policy contract'), fingerprint: text(source, 'fingerprint', 'policy contract'), layout: readLayout(source['layout']), heads };
}

function readListed(raw: unknown, where: string): Listed {
  const source: Fields = fields(raw, where);
  const shape: number[] = each(source['shape'], `${where}.shape`, (entry: unknown, at: string): number => {
    if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 1) throw new ContentError(at, 'expected a positive whole size');
    return entry;
  });
  return { name: text(source, 'name', where), shape };
}

function linear(out: Map<string, readonly number[]>, name: string, outputs: number, inputs: number): void {
  out.set(`${name}.weight`, [outputs, inputs]);
  out.set(`${name}.bias`, [outputs]);
}

function norm(out: Map<string, readonly number[]>, name: string, width: number): void {
  out.set(`${name}.weight`, [width]);
  out.set(`${name}.bias`, [width]);
}

export function expectedShapes(contract: PolicyContract, width: number, layers: number): Map<string, readonly number[]> {
  const out: Map<string, readonly number[]> = new Map<string, readonly number[]>();
  const layout: ObservationLayout = contract.layout;
  const inner: number = width * POLICY_FILE.feedForward;
  out.set('kind', [POLICY_FILE.kinds, width]);
  linear(out, 'self_in.0', width, layout.self + layout.rays);
  linear(out, 'self_in.2', width, width);
  linear(out, 'slot_in.0', width, layout.slot);
  linear(out, 'slot_in.2', width, width);
  linear(out, 'entity_in.0', width, layout.entity);
  linear(out, 'entity_in.2', width, width);
  for (let layer: number = 0; layer < layers; layer += 1) {
    const at: string = `mixer.layers.${layer}`;
    out.set(`${at}.self_attn.in_proj_weight`, [width * 3, width]);
    out.set(`${at}.self_attn.in_proj_bias`, [width * 3]);
    linear(out, `${at}.self_attn.out_proj`, width, width);
    linear(out, `${at}.linear1`, inner, width);
    linear(out, `${at}.linear2`, width, inner);
    norm(out, `${at}.norm1`, width);
    norm(out, `${at}.norm2`, width);
  }
  norm(out, 'norm', width);
  linear(out, 'trunk.0', inner, inner);
  linear(out, 'trunk.2', width, inner);
  linear(out, 'move', contract.heads[0] ?? 0, width);
  linear(out, 'skip_skill', 1, width);
  linear(out, 'skill_query', width, width);
  linear(out, 'target_query', width, width);
  linear(out, 'use', contract.heads[3] ?? 0, width);
  return out;
}

function sameShape(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((size: number, index: number): boolean => size === b[index]);
}

function checkHeads(contract: PolicyContract): void {
  const layout: ObservationLayout = contract.layout;
  const [move, skill, target, use] = contract.heads;
  if (contract.heads.length !== 4 || move === undefined || skill === undefined || target === undefined || use === undefined) throw new Error(`a policy file has 4 action heads, this one has ${contract.heads.length}`);
  if (skill !== layout.slots + 1) throw new Error(`the skill head has ${skill} choices, the layout has ${layout.slots} slots`);
  if (target > layout.entities) throw new Error(`the target head has ${target} choices, more than the ${layout.entities} entity tokens`);
  if (move + skill + target + use !== layout.mask) throw new Error(`the heads have ${move + skill + target + use} choices, the mask ${layout.mask}`);
  if (layout.self + layout.slot * layout.slots + layout.entity * layout.entities + layout.rays !== layout.size) throw new Error('the layout blocks do not add up to its size');
}

function headerText(bytes: Uint8Array): { readonly header: unknown; readonly dataStart: number } {
  const magic: string = String.fromCharCode(...bytes.subarray(0, POLICY_FILE.magic.length));
  if (magic !== POLICY_FILE.magic) throw new Error('not a Lost Storm policy file: wrong magic');
  const view: DataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lengthAt: number = POLICY_FILE.magic.length;
  if (bytes.byteLength < lengthAt + POLICY_FILE.lengthBytes) throw new Error('a policy file ends before its header length');
  const length: number = view.getUint32(lengthAt, true);
  const start: number = lengthAt + POLICY_FILE.lengthBytes;
  if (start + length > bytes.byteLength) throw new Error('a policy file ends inside its header');
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + length)));
  const end: number = start + length;
  return { header: parsed, dataStart: end + (end % POLICY_FILE.halfBytes) };
}

function readUpdate(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  const source: Fields = fields(raw, 'policy source');
  const update: unknown = source['update'];
  return typeof update === 'number' && Number.isFinite(update) ? update : null;
}

export function readPolicyFile(bytes: Uint8Array): PolicyFile {
  const { header, dataStart } = headerText(bytes);
  const source: Fields = fields(header, 'policy file header');
  if (numeric(source, 'format', 'policy file header') !== POLICY_FILE.format) throw new Error(`policy file format ${String(source['format'])} is not ${POLICY_FILE.format}`);
  if (text(source, 'dtype', 'policy file header') !== POLICY_FILE.dtype) throw new Error(`policy file numbers are ${String(source['dtype'])}, not ${POLICY_FILE.dtype}`);
  const contract: PolicyContract = readContract(source['contract']);
  checkHeads(contract);
  const width: number = whole(source, 'width', 'policy file header');
  const layers: number = whole(source, 'layers', 'policy file header');
  const attentionHeads: number = whole(source, 'attentionHeads', 'policy file header');
  if (width < 1 || layers < 1 || attentionHeads < 1 || width % attentionHeads !== 0) throw new Error(`a width of ${width} does not split into ${attentionHeads} attention heads`);
  const listed: Listed[] = items(source['tensors'], 'policy file tensors').map((entry: unknown, index: number): Listed => readListed(entry, `policy file tensors[${index}]`));
  const expected: Map<string, readonly number[]> = expectedShapes(contract, width, layers);
  const view: DataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tensors: Map<string, PolicyTensor> = new Map<string, PolicyTensor>();
  let at: number = dataStart;
  for (const entry of listed) {
    const wanted: readonly number[] | undefined = expected.get(entry.name);
    if (wanted === undefined) throw new Error(`a policy file holds ${entry.name}, which the policy has no use for`);
    if (!sameShape(wanted, entry.shape)) throw new Error(`${entry.name} is ${entry.shape.join('x')}, the policy needs ${wanted.join('x')}`);
    if (tensors.has(entry.name)) throw new Error(`a policy file holds ${entry.name} twice`);
    const count: number = entry.shape.reduce((product: number, size: number): number => product * size, 1);
    if (at + count * POLICY_FILE.halfBytes > bytes.byteLength) throw new Error(`a policy file ends inside ${entry.name}`);
    const values: Float32Array = new Float32Array(count);
    for (let index: number = 0; index < count; index += 1) values[index] = halfToFloat(view.getUint16(at + index * POLICY_FILE.halfBytes, true));
    at += count * POLICY_FILE.halfBytes;
    tensors.set(entry.name, { name: entry.name, shape: entry.shape, values });
  }
  const missing: string[] = [...expected.keys()].filter((name: string): boolean => !tensors.has(name));
  if (missing.length > 0) throw new Error(`a policy file lacks ${missing.join(', ')}`);
  if (at !== bytes.byteLength) throw new Error(`a policy file holds ${bytes.byteLength - at} bytes past its last tensor`);
  return { contract, width, layers, attentionHeads, tensors, update: readUpdate(source['source']) };
}

export function policyFits(file: PolicyFile): boolean {
  return file.contract.fingerprint === contractShape().fingerprint;
}
