import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readLine, readPlayer, readServerFrame } from './live-protocol.ts';
import type { LivePlayer, ServerFrame } from './live-protocol.ts';

const WREN: Readonly<Record<string, unknown>> = { id: 'h1', name: 'Wren', username: null, hero: 'man', worn: { chest: 'traveller_coat' }, x: 21, z: 18, facing: 0 };

void test('a player the server marks as a resident is read as one, and no other value marks one', (): void => {
  assert.deepEqual(readPlayer({ ...WREN, resident: true }), { ...WREN, resident: true });
  for (const value of [false, 1, 'true', null, {}]) assert.deepEqual(readPlayer({ ...WREN, resident: value }), WREN);
  assert.deepEqual(readPlayer(WREN), WREN);
});

void test('a resident arrives marked in the joined frame and in the list of who is present', (): void => {
  const joined: ServerFrame | null = readServerFrame(JSON.stringify({ type: 'joined', player: { ...WREN, resident: true } }));
  assert.ok(joined !== null && joined.type === 'joined');
  assert.equal(joined.player.resident, true);
  const present: ServerFrame | null = readServerFrame(JSON.stringify({ type: 'present', zone: 'hideout', you: 'h2', players: [{ ...WREN, resident: true }, { ...WREN, id: 'h3' }], chat: [] }));
  assert.ok(present !== null && present.type === 'present');
  assert.deepEqual(
    present.players.map((player: LivePlayer): boolean => player.resident === true),
    [true, false],
  );
});

const SAID: Readonly<Record<string, unknown>> = { id: 9, from: 'h1', name: 'Wayfarer', text: 'the rain is late tonight', at: '2026-11-22T12:00:00.000Z', own: false };

void test('a chat line the server marks as a resident’s is read as one, in General, in a whisper and in the replay, and no other value marks one', (): void => {
  assert.deepEqual(readLine({ ...SAID, resident: true }), { ...SAID, resident: true });
  for (const value of [false, 1, 'true', null]) assert.deepEqual(readLine({ ...SAID, resident: value }), SAID);
  assert.deepEqual(readLine(SAID), SAID);
  const said: ServerFrame | null = readServerFrame(JSON.stringify({ type: 'said', line: { ...SAID, resident: true } }));
  assert.ok(said !== null && said.type === 'said');
  assert.equal(said.line.resident, true);
  const whisper: ServerFrame | null = readServerFrame(JSON.stringify({ type: 'whisper', dir: 'from', with: 'Wayfarer', line: { ...SAID, resident: true } }));
  assert.ok(whisper !== null && whisper.type === 'whisper');
  assert.equal(whisper.line.resident, true);
  const welcome: ServerFrame | null = readServerFrame(JSON.stringify({ type: 'welcome', you: 'c1', chat: [{ ...SAID, resident: true }, { ...SAID, id: 10, name: 'Wren' }], trade: 1, claimed: false }));
  assert.ok(welcome !== null && welcome.type === 'welcome' && welcome.roaming !== null);
  assert.deepEqual(
    welcome.roaming.chat.map((line): boolean => line.resident === true),
    [true, false],
  );
});
