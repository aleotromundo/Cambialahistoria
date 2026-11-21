import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { LAYOUT, ACTION_HEADS } from './contract.ts';
import type { PolicyContract, PolicyFile } from './policy-file.ts';
import { expectedShapes, halfToFloat, policyFits, readPolicyFile } from './policy-file.ts';

const SHIPPED: string = 'public/models/rl/duel-pilot.bin';

const TINY: PolicyContract = { version: 1, fingerprint: 'feedbeef', layout: LAYOUT, heads: ACTION_HEADS };

interface Built {
  readonly header: Record<string, unknown>;
  readonly shapes: Map<string, readonly number[]>;
}

function tinyHeader(): Built {
  const shapes: Map<string, readonly number[]> = expectedShapes(TINY, 4, 1);
  const tensors: { name: string; shape: readonly number[] }[] = [...shapes].map(([name, shape]: [string, readonly number[]]): { name: string; shape: readonly number[] } => ({ name, shape }));
  return { header: { format: 1, dtype: 'float16', width: 4, layers: 1, attentionHeads: 2, contract: TINY, tensors, source: { update: 12 } }, shapes };
}

function fileBytes(header: Record<string, unknown>, numbers: number, extra: number = 0): Uint8Array {
  const text: Uint8Array = new TextEncoder().encode(JSON.stringify(header));
  const start: number = 8 + text.length;
  const padded: number = start + (start % 2);
  const bytes: Uint8Array = new Uint8Array(padded + numbers * 2 + extra);
  bytes.set(new TextEncoder().encode('LSPL'), 0);
  new DataView(bytes.buffer).setUint32(4, text.length, true);
  bytes.set(text, 8);
  const view: DataView = new DataView(bytes.buffer);
  for (let index: number = 0; index < numbers; index += 1) view.setUint16(padded + index * 2, 0x3c00, true);
  return bytes;
}

function countOf(shapes: Map<string, readonly number[]>): number {
  return [...shapes.values()].reduce((sum: number, shape: readonly number[]): number => sum + shape.reduce((product: number, size: number): number => product * size, 1), 0);
}

void test('half floats widen bit for bit', (): void => {
  assert.equal(halfToFloat(0x0000), 0);
  assert.ok(Object.is(halfToFloat(0x8000), -0));
  assert.equal(halfToFloat(0x3c00), 1);
  assert.equal(halfToFloat(0xc000), -2);
  assert.equal(halfToFloat(0x3555), 0.333251953125);
  assert.equal(halfToFloat(0x0001), 2 ** -24);
  assert.equal(halfToFloat(0x03ff), 1023 * 2 ** -24);
  assert.equal(halfToFloat(0x7bff), 65504);
  assert.equal(halfToFloat(0x7c00), Infinity);
  assert.equal(halfToFloat(0xfc00), -Infinity);
  assert.ok(Number.isNaN(halfToFloat(0x7e00)));
});

void test('a well formed file reads into every tensor the policy needs', (): void => {
  const { header, shapes } = tinyHeader();
  const file: PolicyFile = readPolicyFile(fileBytes(header, countOf(shapes)));
  assert.equal(file.tensors.size, shapes.size);
  assert.equal(file.update, 12);
  assert.deepEqual(file.tensors.get('kind')?.shape, [3, 4]);
  assert.ok([...(file.tensors.get('move.weight')?.values ?? [])].every((value: number): boolean => value === 1));
});

void test('a file with the wrong magic, a short or long data block, or a wrong tensor is refused', (): void => {
  const { header, shapes } = tinyHeader();
  const count: number = countOf(shapes);
  const wrongMagic: Uint8Array = fileBytes(header, count);
  wrongMagic[0] = 0x58;
  assert.throws((): PolicyFile => readPolicyFile(wrongMagic), /magic/);
  assert.throws((): PolicyFile => readPolicyFile(fileBytes(header, count - 1)), /ends inside/);
  assert.throws((): PolicyFile => readPolicyFile(fileBytes(header, count, 2)), /past its last tensor/);
  const listed: readonly unknown[] = Array.isArray(header['tensors']) ? header['tensors'] : [];
  const lacking: Record<string, unknown> = { ...header, tensors: listed.slice(1) };
  assert.throws((): PolicyFile => readPolicyFile(fileBytes(lacking, count - 12)), /lacks kind/);
  const misshapen: Record<string, unknown> = { ...header, tensors: [{ name: 'kind', shape: [4, 4] }, ...listed.slice(1)] };
  assert.throws((): PolicyFile => readPolicyFile(fileBytes(misshapen, count + 4)), /kind is 4x4/);
  assert.throws((): PolicyFile => readPolicyFile(fileBytes({ ...header, dtype: 'float32' }, count)), /float32/);
  assert.throws((): PolicyFile => readPolicyFile(fileBytes({ ...header, attentionHeads: 3 }, count)), /attention heads/);
});

void test('a file for another contract reads but does not fit the game', (): void => {
  const { header, shapes } = tinyHeader();
  assert.equal(policyFits(readPolicyFile(fileBytes(header, countOf(shapes)))), false);
});

void test('the shipped model fits the contract the game speaks', (): void => {
  const file: PolicyFile = readPolicyFile(new Uint8Array(readFileSync(SHIPPED)));
  assert.ok(policyFits(file), `${SHIPPED} was exported for contract ${file.contract.fingerprint}; re-export it with train export after widening`);
  assert.deepEqual(file.contract.layout, LAYOUT);
});
