import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readPlayer, readServerFrame } from './live-protocol.ts';
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
