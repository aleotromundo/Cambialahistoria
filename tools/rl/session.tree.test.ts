import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import type { Fields } from '../../sim/content/read.ts';
import { fields } from '../../sim/content/read.ts';
import { createRng } from '../../sim/rng.ts';
import type { ArenaOptions } from '../../sim/rl/arena.ts';
import { buildPoints, buildProblems } from '../../sim/rl/build.ts';
import { DUEL_KIT } from '../../sim/rl/kit.ts';
import type { Frame } from './frames.ts';
import { frame, FRAME, jsonPart, readJson } from './frames.ts';
import type { Reply } from './session.ts';
import { demoOptions, handle, readDemoRequest, readPoolOptions } from './session.ts';

const CONTENT: Content = loadContent();
const SPIN = { name: 'Spin', weapon: 'warden_broadsword', skills: ['thunderhead'], route: ['blade_thunderhead', 'heavy_hands', 'blade_1'] } as const;

function only(reply: Reply): Frame {
  const all: Buffer[] = [...reply.frames];
  const out: Buffer | undefined = all[0];
  assert.ok(out !== undefined && all.length === 1);
  return { kind: out.readUInt8(FRAME.word), payload: out.subarray(FRAME.header) };
}

function hello(value: unknown): Frame {
  return only(handle({ content: CONTENT, pool: null }, { kind: FRAME.hello, payload: frame(FRAME.hello, jsonPart(value)).subarray(FRAME.header + FRAME.word) }));
}

function said(answer: Frame): Fields {
  return fields(readJson(answer.payload.subarray(FRAME.word)), 'hello');
}

void test('hello with treeBuilds says so, and refuses it beside a fixed build', (): void => {
  assert.equal(said(hello({ seed: 3, envs: 2, duels: 1, treeBuilds: true, levelRange: { min: 1, max: 30 } }))['treeBuilds'], true);
  assert.equal(said(hello({ seed: 3, envs: 1 }))['treeBuilds'], undefined);
  assert.equal(hello({ seed: 3, envs: 1, treeBuilds: true, build: SPIN }).kind, FRAME.error);
  assert.equal(hello({ seed: 3, envs: 1, treeBuilds: 'yes' }).kind, FRAME.error);
});

void test('the pool and demo requests read treeBuilds', (): void => {
  assert.equal(readPoolOptions({ seed: 1 }).treeBuilds, undefined);
  assert.equal(readPoolOptions({ seed: 1, treeBuilds: true }).treeBuilds, true);
  assert.equal(readDemoRequest({ seed: 1 }).treeBuilds, false);
  assert.equal(readDemoRequest({ seed: 1, treeBuilds: true }).treeBuilds, true);
});

void test('the bot demonstrates tree builds at a level from the range', (): void => {
  const request = readDemoRequest({ seed: 7, episodes: 3, treeBuilds: true, levelRange: { min: 22, max: 30 } });
  const options: ArenaOptions = demoOptions(CONTENT, request, createRng(1), 0);
  const level: number = options.level ?? 0;
  assert.ok(level >= 22 && level <= 30, `level ${level}`);
  assert.ok(options.build !== undefined);
  assert.equal(options.build.route.length, buildPoints(CONTENT, level));
  assert.deepEqual(buildProblems(CONTENT, DUEL_KIT, options.build, level), []);
});
