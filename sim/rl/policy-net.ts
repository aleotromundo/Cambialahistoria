import type { Action, ObservationLayout } from './contract.ts';
import type { PolicyFile, PolicyTensor } from './policy-file.ts';
import { POLICY_FILE } from './policy-file.ts';

export const POLICY_NET = {
  masked: -1e9,
  normEpsilon: 1e-5,
  heroKind: 0,
  slotKind: 1,
  entityKind: 2,
} as const;

const ERFC = {
  half: 0.5,
  offset: -1.26551223,
  terms: [1.00002368, 0.37409196, 0.09678418, -0.18628806, 0.27886807, -1.13520398, 1.48851587, -0.82215223, 0.17087277],
} as const;

interface Linear {
  readonly weight: Float32Array;
  readonly bias: Float32Array;
  readonly inputs: number;
  readonly outputs: number;
}

interface Norm {
  readonly weight: Float32Array;
  readonly bias: Float32Array;
}

interface EncoderLayer {
  readonly inProj: Linear;
  readonly outProj: Linear;
  readonly up: Linear;
  readonly down: Linear;
  readonly norm1: Norm;
  readonly norm2: Norm;
}

interface Scratch {
  readonly tokens: Float64Array;
  readonly normed: Float64Array;
  readonly qkv: Float64Array;
  readonly attended: Float64Array;
  readonly inner: Float64Array;
  readonly wide: Float64Array;
  readonly scores: Float64Array;
  readonly embedIn: Float64Array;
  readonly embedMid: Float64Array;
  readonly state: Float64Array;
  readonly query: Float64Array;
  readonly absent: Uint8Array;
  readonly needed: Uint8Array;
  readonly computed: Int32Array;
}

export interface PolicyNet {
  readonly layout: ObservationLayout;
  readonly heads: readonly number[];
  readonly width: number;
  readonly attentionHeads: number;
  readonly tokenCount: number;
  readonly targets: number;
  readonly kind: Float32Array;
  readonly heroIn: readonly [Linear, Linear];
  readonly slotIn: readonly [Linear, Linear];
  readonly entityIn: readonly [Linear, Linear];
  readonly layers: readonly EncoderLayer[];
  readonly norm: Norm;
  readonly trunk: readonly [Linear, Linear];
  readonly move: Linear;
  readonly skipSkill: Linear;
  readonly skillQuery: Linear;
  readonly targetQuery: Linear;
  readonly use: Linear;
  readonly scratch: Scratch;
}

export interface HeadLogits {
  readonly move: Float64Array;
  readonly skill: Float64Array;
  readonly target: Float64Array;
  readonly use: Float64Array;
}

function tensor(file: PolicyFile, name: string): PolicyTensor {
  const found: PolicyTensor | undefined = file.tensors.get(name);
  if (found === undefined) throw new Error(`the policy lacks ${name}`);
  return found;
}

function linearOf(file: PolicyFile, name: string): Linear {
  const weight: PolicyTensor = tensor(file, `${name}.weight`);
  return { weight: weight.values, bias: tensor(file, `${name}.bias`).values, outputs: weight.shape[0] ?? 0, inputs: weight.shape[1] ?? 0 };
}

function normOf(file: PolicyFile, name: string): Norm {
  return { weight: tensor(file, `${name}.weight`).values, bias: tensor(file, `${name}.bias`).values };
}

function layerOf(file: PolicyFile, layer: number): EncoderLayer {
  const at: string = `mixer.layers.${layer}`;
  const inWeight: PolicyTensor = tensor(file, `${at}.self_attn.in_proj_weight`);
  return {
    inProj: { weight: inWeight.values, bias: tensor(file, `${at}.self_attn.in_proj_bias`).values, outputs: inWeight.shape[0] ?? 0, inputs: inWeight.shape[1] ?? 0 },
    outProj: linearOf(file, `${at}.self_attn.out_proj`),
    up: linearOf(file, `${at}.linear1`),
    down: linearOf(file, `${at}.linear2`),
    norm1: normOf(file, `${at}.norm1`),
    norm2: normOf(file, `${at}.norm2`),
  };
}

export function createPolicyNet(file: PolicyFile): PolicyNet {
  const layout: ObservationLayout = file.contract.layout;
  const width: number = file.width;
  const tokenCount: number = 1 + layout.slots + layout.entities;
  const inner: number = width * POLICY_FILE.feedForward;
  const widest: number = Math.max(layout.self + layout.rays, layout.slot, layout.entity, inner);
  return {
    layout,
    heads: file.contract.heads,
    width,
    attentionHeads: file.attentionHeads,
    tokenCount,
    targets: file.contract.heads[2] ?? 0,
    kind: tensor(file, 'kind').values,
    heroIn: [linearOf(file, 'self_in.0'), linearOf(file, 'self_in.2')],
    slotIn: [linearOf(file, 'slot_in.0'), linearOf(file, 'slot_in.2')],
    entityIn: [linearOf(file, 'entity_in.0'), linearOf(file, 'entity_in.2')],
    layers: Array.from({ length: file.layers }, (_unused: unknown, layer: number): EncoderLayer => layerOf(file, layer)),
    norm: normOf(file, 'norm'),
    trunk: [linearOf(file, 'trunk.0'), linearOf(file, 'trunk.2')],
    move: linearOf(file, 'move'),
    skipSkill: linearOf(file, 'skip_skill'),
    skillQuery: linearOf(file, 'skill_query'),
    targetQuery: linearOf(file, 'target_query'),
    use: linearOf(file, 'use'),
    scratch: {
      tokens: new Float64Array(tokenCount * width),
      normed: new Float64Array(tokenCount * width),
      qkv: new Float64Array(tokenCount * width * 3),
      attended: new Float64Array(tokenCount * width),
      inner: new Float64Array(inner),
      wide: new Float64Array(inner),
      scores: new Float64Array(tokenCount),
      embedIn: new Float64Array(widest),
      embedMid: new Float64Array(width),
      state: new Float64Array(width),
      query: new Float64Array(width),
      absent: new Uint8Array(tokenCount),
      needed: new Uint8Array(tokenCount),
      computed: new Int32Array(tokenCount),
    },
  };
}

function erf(x: number): number {
  const z: number = Math.abs(x);
  const t: number = 1 / (1 + ERFC.half * z);
  let poly: number = 0;
  for (let index: number = ERFC.terms.length - 1; index >= 0; index -= 1) poly = t * (poly + (ERFC.terms[index] ?? 0));
  const tail: number = t * Math.exp(-z * z + ERFC.offset + poly);
  return x >= 0 ? 1 - tail : tail - 1;
}

export function gelu(x: number): number {
  return 0.5 * x * (1 + erf(x / Math.SQRT2));
}

function apply(layer: Linear, input: Float64Array | Float32Array, inputAt: number, out: Float64Array, outAt: number): void {
  const inputs: number = layer.inputs;
  for (let row: number = 0; row < layer.outputs; row += 1) {
    let sum: number = layer.bias[row] ?? 0;
    const base: number = row * inputs;
    for (let column: number = 0; column < inputs; column += 1) sum += (layer.weight[base + column] ?? 0) * (input[inputAt + column] ?? 0);
    out[outAt + row] = sum;
  }
}

function geluInPlace(values: Float64Array, from: number, count: number): void {
  for (let index: number = from; index < from + count; index += 1) values[index] = gelu(values[index] ?? 0);
}

function layerNorm(norm: Norm, input: Float64Array, inputAt: number, out: Float64Array, outAt: number, width: number): void {
  let mean: number = 0;
  for (let index: number = 0; index < width; index += 1) mean += input[inputAt + index] ?? 0;
  mean /= width;
  let variance: number = 0;
  for (let index: number = 0; index < width; index += 1) {
    const gap: number = (input[inputAt + index] ?? 0) - mean;
    variance += gap * gap;
  }
  const scale: number = 1 / Math.sqrt(variance / width + POLICY_NET.normEpsilon);
  for (let index: number = 0; index < width; index += 1) out[outAt + index] = ((input[inputAt + index] ?? 0) - mean) * scale * (norm.weight[index] ?? 0) + (norm.bias[index] ?? 0);
}

function embed(net: PolicyNet, pair: readonly [Linear, Linear], input: Float64Array | Float32Array, inputAt: number, kind: number, token: number): void {
  const scratch: Scratch = net.scratch;
  apply(pair[0], input, inputAt, scratch.embedMid, 0);
  geluInPlace(scratch.embedMid, 0, net.width);
  apply(pair[1], scratch.embedMid, 0, scratch.tokens, token * net.width);
  for (let index: number = 0; index < net.width; index += 1) scratch.tokens[token * net.width + index] = (scratch.tokens[token * net.width + index] ?? 0) + (net.kind[kind * net.width + index] ?? 0);
}

function allowedChoice(net: PolicyNet, mask: Uint8Array, token: number): boolean {
  const moves: number = net.heads[0] ?? 0;
  const skills: number = net.heads[1] ?? 0;
  const slot: number = token - 1;
  if (slot >= 0 && slot < net.layout.slots) return (mask[moves + 1 + slot] ?? 0) > 0;
  const entity: number = slot - net.layout.slots;
  return entity >= 0 && entity < net.targets && (mask[moves + skills + entity] ?? 0) > 0;
}

function markNeeded(net: PolicyNet, mask: Uint8Array): void {
  const scratch: Scratch = net.scratch;
  for (let token: number = 0; token < net.tokenCount; token += 1) scratch.needed[token] = scratch.absent[token] === 0 || allowedChoice(net, mask, token) ? 1 : 0;
}

function markAbsent(net: PolicyNet, obs: Float32Array): void {
  const layout: ObservationLayout = net.layout;
  const scratch: Scratch = net.scratch;
  scratch.absent[0] = 0;
  for (let slot: number = 0; slot < layout.slots; slot += 1) scratch.absent[1 + slot] = (obs[layout.self + slot * layout.slot] ?? 0) <= 0 ? 1 : 0;
  const entitiesAt: number = layout.self + layout.slot * layout.slots;
  for (let entity: number = 0; entity < layout.entities; entity += 1) scratch.absent[1 + layout.slots + entity] = (obs[entitiesAt + entity * layout.entity] ?? 0) <= 0 ? 1 : 0;
}

function embedTokens(net: PolicyNet, obs: Float32Array): void {
  const layout: ObservationLayout = net.layout;
  const scratch: Scratch = net.scratch;
  scratch.embedIn.set(obs.subarray(0, layout.self), 0);
  scratch.embedIn.set(obs.subarray(layout.size - layout.rays, layout.size), layout.self);
  embed(net, net.heroIn, scratch.embedIn, 0, POLICY_NET.heroKind, 0);
  for (let slot: number = 0; slot < layout.slots; slot += 1) if (scratch.needed[1 + slot] === 1) embed(net, net.slotIn, obs, layout.self + slot * layout.slot, POLICY_NET.slotKind, 1 + slot);
  const entitiesAt: number = layout.self + layout.slot * layout.slots;
  for (let entity: number = 0; entity < layout.entities; entity += 1) {
    const token: number = 1 + layout.slots + entity;
    if (scratch.needed[token] === 1) embed(net, net.entityIn, obs, entitiesAt + entity * layout.entity, POLICY_NET.entityKind, token);
  }
}

function computedTokens(net: PolicyNet): number {
  const scratch: Scratch = net.scratch;
  let count: number = 0;
  for (let token: number = 0; token < net.tokenCount; token += 1) {
    if (scratch.needed[token] === 0) continue;
    scratch.computed[count] = token;
    count += 1;
  }
  return count;
}

function attend(net: PolicyNet, layer: EncoderLayer, count: number): void {
  const scratch: Scratch = net.scratch;
  const width: number = net.width;
  const perHead: number = width / net.attentionHeads;
  const scale: number = 1 / Math.sqrt(perHead);
  for (let index: number = 0; index < count; index += 1) {
    const token: number = scratch.computed[index] ?? 0;
    layerNorm(layer.norm1, scratch.tokens, token * width, scratch.normed, token * width, width);
    apply(layer.inProj, scratch.normed, token * width, scratch.qkv, token * width * 3);
  }
  for (let index: number = 0; index < count; index += 1) {
    const token: number = scratch.computed[index] ?? 0;
    for (let head: number = 0; head < net.attentionHeads; head += 1) {
      const offset: number = head * perHead;
      let top: number = -Infinity;
      for (let keyIndex: number = 0; keyIndex < count; keyIndex += 1) {
        const key: number = scratch.computed[keyIndex] ?? 0;
        if (scratch.absent[key] === 1) continue;
        let dot: number = 0;
        for (let feature: number = 0; feature < perHead; feature += 1) dot += (scratch.qkv[token * width * 3 + offset + feature] ?? 0) * (scratch.qkv[key * width * 3 + width + offset + feature] ?? 0);
        const score: number = dot * scale;
        scratch.scores[key] = score;
        if (score > top) top = score;
      }
      let total: number = 0;
      for (let keyIndex: number = 0; keyIndex < count; keyIndex += 1) {
        const key: number = scratch.computed[keyIndex] ?? 0;
        if (scratch.absent[key] === 1) continue;
        const weight: number = Math.exp((scratch.scores[key] ?? 0) - top);
        scratch.scores[key] = weight;
        total += weight;
      }
      for (let feature: number = 0; feature < perHead; feature += 1) {
        let sum: number = 0;
        for (let keyIndex: number = 0; keyIndex < count; keyIndex += 1) {
          const key: number = scratch.computed[keyIndex] ?? 0;
          if (scratch.absent[key] === 1) continue;
          sum += (scratch.scores[key] ?? 0) * (scratch.qkv[key * width * 3 + width * 2 + offset + feature] ?? 0);
        }
        scratch.normed[token * width + offset + feature] = sum / total;
      }
    }
  }
  for (let index: number = 0; index < count; index += 1) {
    const token: number = scratch.computed[index] ?? 0;
    apply(layer.outProj, scratch.normed, token * width, scratch.attended, token * width);
    for (let feature: number = 0; feature < width; feature += 1) scratch.tokens[token * width + feature] = (scratch.tokens[token * width + feature] ?? 0) + (scratch.attended[token * width + feature] ?? 0);
  }
}

function feedForward(net: PolicyNet, layer: EncoderLayer, count: number): void {
  const scratch: Scratch = net.scratch;
  const width: number = net.width;
  for (let index: number = 0; index < count; index += 1) {
    const token: number = scratch.computed[index] ?? 0;
    layerNorm(layer.norm2, scratch.tokens, token * width, scratch.normed, token * width, width);
    apply(layer.up, scratch.normed, token * width, scratch.inner, 0);
    for (let feature: number = 0; feature < layer.up.outputs; feature += 1) scratch.inner[feature] = Math.max(0, scratch.inner[feature] ?? 0);
    apply(layer.down, scratch.inner, 0, scratch.attended, token * width);
    for (let feature: number = 0; feature < width; feature += 1) scratch.tokens[token * width + feature] = (scratch.tokens[token * width + feature] ?? 0) + (scratch.attended[token * width + feature] ?? 0);
  }
}

function trunkState(net: PolicyNet, count: number): void {
  const scratch: Scratch = net.scratch;
  const width: number = net.width;
  for (let index: number = 0; index < count; index += 1) {
    const token: number = scratch.computed[index] ?? 0;
    layerNorm(net.norm, scratch.tokens, token * width, scratch.normed, token * width, width);
  }
  const joined: Float64Array = scratch.wide;
  joined.fill(0);
  for (let feature: number = 0; feature < width; feature += 1) joined[feature] = scratch.normed[feature] ?? 0;
  let present: number = 0;
  for (let token: number = 1; token < net.tokenCount; token += 1) {
    if (scratch.absent[token] === 1) continue;
    present += 1;
    for (let feature: number = 0; feature < width; feature += 1) joined[width + feature] = (joined[width + feature] ?? 0) + (scratch.normed[token * width + feature] ?? 0);
  }
  const share: number = 1 / Math.max(1, present);
  for (let feature: number = 0; feature < width; feature += 1) joined[width + feature] = (joined[width + feature] ?? 0) * share;
  apply(net.trunk[0], joined, 0, scratch.inner, 0);
  geluInPlace(scratch.inner, 0, net.trunk[0].outputs);
  apply(net.trunk[1], scratch.inner, 0, scratch.state, 0);
  geluInPlace(scratch.state, 0, width);
}

function scored(net: PolicyNet, query: Linear, first: number, count: number, out: Float64Array, outAt: number): void {
  const scratch: Scratch = net.scratch;
  const width: number = net.width;
  const scale: number = width ** -0.5;
  apply(query, scratch.state, 0, scratch.query, 0);
  for (let index: number = 0; index < count; index += 1) {
    const token: number = first + index;
    let dot: number = 0;
    for (let feature: number = 0; feature < width; feature += 1) dot += (scratch.query[feature] ?? 0) * (scratch.normed[token * width + feature] ?? 0);
    out[outAt + index] = dot * scale;
  }
}

function maskHead(values: Float64Array, mask: Uint8Array, at: number): void {
  for (let index: number = 0; index < values.length; index += 1) if ((mask[at + index] ?? 0) === 0) values[index] = POLICY_NET.masked;
}

export function policyLogits(net: PolicyNet, obs: Float32Array, mask: Uint8Array): HeadLogits {
  if (obs.length !== net.layout.size) throw new Error(`the policy reads ${net.layout.size} numbers, got ${obs.length}`);
  if (mask.length !== net.layout.mask) throw new Error(`the policy reads a mask of ${net.layout.mask}, got ${mask.length}`);
  markAbsent(net, obs);
  markNeeded(net, mask);
  embedTokens(net, obs);
  const count: number = computedTokens(net);
  for (const layer of net.layers) {
    attend(net, layer, count);
    feedForward(net, layer, count);
  }
  trunkState(net, count);
  const [moves, skills, targets, uses] = [net.heads[0] ?? 0, net.heads[1] ?? 0, net.heads[2] ?? 0, net.heads[3] ?? 0];
  const move: Float64Array = new Float64Array(moves);
  const skill: Float64Array = new Float64Array(skills);
  const target: Float64Array = new Float64Array(targets);
  const use: Float64Array = new Float64Array(uses);
  apply(net.move, net.scratch.state, 0, move, 0);
  apply(net.skipSkill, net.scratch.state, 0, skill, 0);
  scored(net, net.skillQuery, 1, skills - 1, skill, 1);
  scored(net, net.targetQuery, 1 + net.layout.slots, targets, target, 0);
  apply(net.use, net.scratch.state, 0, use, 0);
  maskHead(move, mask, 0);
  maskHead(skill, mask, moves);
  maskHead(target, mask, moves + skills);
  maskHead(use, mask, moves + skills + targets);
  return { move, skill, target, use };
}

function argmax(values: Float64Array): number {
  let best: number = 0;
  for (let index: number = 1; index < values.length; index += 1) if ((values[index] ?? 0) > (values[best] ?? 0)) best = index;
  return best;
}

export function greedyAction(net: PolicyNet, obs: Float32Array, mask: Uint8Array): Action {
  const logits: HeadLogits = policyLogits(net, obs, mask);
  return { move: argmax(logits.move), skill: argmax(logits.skill), target: argmax(logits.target), use: argmax(logits.use) };
}
