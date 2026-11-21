import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Fields } from '../content/read.ts';
import { each, fields, items, text } from '../content/read.ts';
import type { Action } from './contract.ts';
import { LAYOUT } from './contract.ts';
import type { HeadLogits, PolicyNet } from './policy-net.ts';
import { createPolicyNet, gelu, greedyAction, policyLogits } from './policy-net.ts';
import { readPolicyFile } from './policy-file.ts';

const SHIPPED: string = 'public/models/rl/duel-pilot.bin';
const FIXTURE: string = 'sim/rl/policy-net.fixture.json';
const TOLERANCE: number = 1e-3;
const HEADS: readonly (keyof HeadLogits)[] = ['move', 'skill', 'target', 'use'];

interface Sample {
  readonly obs: Float32Array;
  readonly mask: Uint8Array;
  readonly logits: Readonly<Record<keyof HeadLogits, readonly (number | null)[]>>;
  readonly action: readonly number[];
}

function numberOrNull(entry: unknown, where: string): number | null {
  if (entry === null) return null;
  if (typeof entry !== 'number') throw new Error(`${where}: expected a number or null`);
  return entry;
}

function readSample(raw: unknown, where: string): Sample {
  const source: Fields = fields(raw, where);
  const obs: Float32Array = new Float32Array(LAYOUT.size);
  for (const pair of items(source['obs'], `${where}.obs`)) {
    const [index, value] = items(pair, `${where}.obs entry`);
    if (typeof index !== 'number' || typeof value !== 'number') throw new Error(`${where}: an obs entry is not [index, value]`);
    obs[index] = value;
  }
  const mask: Uint8Array = Uint8Array.from(each(source['mask'], `${where}.mask`, (entry: unknown): number => (entry === 1 ? 1 : 0)));
  const heads: Fields = fields(source['logits'], `${where}.logits`);
  const head = (name: keyof HeadLogits): (number | null)[] => each(heads[name], `${where}.logits.${name}`, numberOrNull);
  const action: number[] = each(source['action'], `${where}.action`, (entry: unknown): number => numberOrNull(entry, `${where}.action`) ?? -1);
  return { obs, mask, logits: { move: head('move'), skill: head('skill'), target: head('target'), use: head('use') }, action };
}

function fixture(): { readonly fingerprint: string; readonly samples: readonly Sample[] } {
  const raw: unknown = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const source: Fields = fields(raw, 'fixture');
  return { fingerprint: text(source, 'fingerprint', 'fixture'), samples: each(source['samples'], 'fixture.samples', readSample) };
}

const net: PolicyNet = createPolicyNet(readPolicyFile(new Uint8Array(readFileSync(SHIPPED))));

void test('gelu is the exact erf form', (): void => {
  assert.equal(gelu(0), 0);
  assert.ok(Math.abs(gelu(1) - 0.8413447460685429) < 1e-7);
  assert.ok(Math.abs(gelu(-1) + 0.15865525393145707) < 1e-7);
  assert.ok(Math.abs(gelu(3) - 2.995950305905111) < 1e-7);
});

void test('the fixture was written for the shipped model', (): void => {
  const file = readPolicyFile(new Uint8Array(readFileSync(SHIPPED)));
  assert.equal(fixture().fingerprint, file.contract.fingerprint);
  assert.ok(fixture().samples.length >= 8);
});

void test('every allowed logit matches what PyTorch computed from the same file', (): void => {
  fixture().samples.forEach((sample: Sample, index: number): void => {
    const logits: HeadLogits = policyLogits(net, sample.obs, sample.mask);
    for (const head of HEADS) {
      sample.logits[head].forEach((expected: number | null, choice: number): void => {
        const got: number = logits[head][choice] ?? NaN;
        if (expected === null) {
          assert.equal(got, -1e9, `sample ${index} ${head} ${choice} is masked`);
          return;
        }
        assert.ok(Math.abs(got - expected) <= TOLERANCE * Math.max(1, Math.abs(expected)), `sample ${index} ${head} ${choice}: ${got} against ${expected}`);
      });
    }
  });
});

void test('the greedy choice is the one PyTorch picked', (): void => {
  fixture().samples.forEach((sample: Sample, index: number): void => {
    const action: Action = greedyAction(net, sample.obs, sample.mask);
    assert.deepEqual([action.move, action.skill, action.target, action.use], [...sample.action], `sample ${index}`);
  });
});

void test('the same observation gives the same logits on a second pass', (): void => {
  const sample: Sample | undefined = fixture().samples[0];
  assert.ok(sample !== undefined);
  const first: number[] = [...policyLogits(net, sample.obs, sample.mask).move];
  policyLogits(net, fixture().samples[1]?.obs ?? sample.obs, fixture().samples[1]?.mask ?? sample.mask);
  assert.deepEqual([...policyLogits(net, sample.obs, sample.mask).move], first);
});

void test('a wrong sized observation or mask is refused', (): void => {
  assert.throws((): HeadLogits => policyLogits(net, new Float32Array(3), new Uint8Array(LAYOUT.mask)), /reads/);
  assert.throws((): HeadLogits => policyLogits(net, new Float32Array(LAYOUT.size), new Uint8Array(2)), /mask/);
});
