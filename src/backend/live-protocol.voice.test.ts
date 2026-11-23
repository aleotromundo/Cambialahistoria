import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readLine, readServerFrame } from './live-protocol.ts';
import type { ServerFrame } from './live-protocol.ts';

const SAID: Readonly<Record<string, unknown>> = { id: 9, from: 'h1', name: 'Wayfarer', text: 'walk light', at: '2026-11-24T12:00:00.000Z', own: false };
const KEY: string = 'a'.repeat(64);

void test('a resident’s line carries the name of its spoken clip', (): void => {
  assert.deepEqual(readLine({ ...SAID, resident: true, voice: KEY }), { ...SAID, resident: true, voice: KEY });
  const said: ServerFrame | null = readServerFrame(JSON.stringify({ type: 'said', line: { ...SAID, resident: true, voice: KEY } }));
  assert.ok(said !== null && said.type === 'said');
  assert.equal(said.line.voice, KEY);
});

void test('a clip name is read only on a resident’s line and only in its exact form', (): void => {
  assert.deepEqual(readLine({ ...SAID, voice: KEY }), SAID);
  for (const voice of ['A'.repeat(64), 'a'.repeat(63), `${'a'.repeat(63)}/`, '../secret', 7, null]) assert.deepEqual(readLine({ ...SAID, resident: true, voice }), { ...SAID, resident: true });
});
