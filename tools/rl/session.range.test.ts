import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Fields } from '../../sim/content/read.ts';
import { fields } from '../../sim/content/read.ts';
import { ARENA } from '../../sim/rl/arena.ts';
import { BUILD } from '../../sim/rl/build.ts';
import type { Frame } from './frames.ts';
import { frame, FRAME, jsonPart, readJson } from './frames.ts';
import type { Reply } from './session.ts';
import { handle, readDemoRequest, readPoolOptions } from './session.ts';

const SPIN = { name: 'Spin', weapon: 'warden_broadsword', skills: ['thunderhead'], route: ['blade_thunderhead', 'heavy_hands', 'blade_1'] } as const;

function only(reply: Reply): Frame {
  const all: Buffer[] = [...reply.frames];
  const out: Buffer | undefined = all[0];
  assert.ok(out !== undefined && all.length === 1);
  return { kind: out.readUInt8(FRAME.word), payload: out.subarray(FRAME.header) };
}

function hello(value: unknown): Frame {
  return only(handle({ content: loadContent(), pool: null }, { kind: FRAME.hello, payload: frame(FRAME.hello, jsonPart(value)).subarray(FRAME.header + FRAME.word) }));
}

function said(answer: Frame): Fields {
  return fields(readJson(answer.payload.subarray(FRAME.word)), 'hello');
}

void test('hello answers the level range it trains over, the arena levels by default', (): void => {
  assert.deepEqual(said(hello({ seed: 3, envs: 1 }))['levels'], ARENA.levels);
  assert.deepEqual(said(hello({ seed: 3, envs: 1, levelRange: { min: 1, max: 20 } }))['levels'], { min: 1, max: 20 });
});

void test('hello refuses a level range past the top level, and weights that do not fit the range', (): void => {
  assert.equal(hello({ seed: 3, envs: 1, levelRange: { min: 1, max: 99 } }).kind, FRAME.error);
  assert.equal(hello({ seed: 3, envs: 1, levelRange: { min: 1, max: 20 }, levels: [1, 1] }).kind, FRAME.error);
});

void test('hello names the build level it was given, the duel level by default', (): void => {
  assert.equal(said(hello({ seed: 3, envs: 1, build: SPIN }))['duelLevel'], BUILD.level);
  assert.equal(said(hello({ seed: 3, envs: 1, build: SPIN, buildLevel: 14 }))['duelLevel'], 14);
  assert.equal(hello({ seed: 3, envs: 1, build: SPIN, buildLevel: 2.5 }).kind, FRAME.error);
});

void test('the pool and demo requests read the range and the build level', (): void => {
  assert.equal(readPoolOptions({ seed: 1 }).range, undefined);
  assert.deepEqual(readPoolOptions({ seed: 1, levelRange: { min: 2, max: 20 } }).range, { min: 2, max: 20 });
  assert.equal(readPoolOptions({ seed: 1, buildLevel: 18 }).buildLevel, 18);
  assert.deepEqual(readDemoRequest({ seed: 1 }).range, ARENA.levels);
  assert.equal(readDemoRequest({ seed: 1 }).buildLevel, BUILD.level);
  assert.equal(readDemoRequest({ seed: 1, buildLevel: 18, levelRange: { min: 1, max: 20 } }).buildLevel, 18);
});
