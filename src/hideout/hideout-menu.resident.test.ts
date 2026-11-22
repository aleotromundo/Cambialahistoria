import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChatLine } from '../backend/live-protocol.ts';
import type { OtherTarget } from '../render/others.ts';
import { opensFor, tradeTarget } from './hideout-menu.ts';

const RESIDENT: string = 'Wayfarer';

function hideoutWith(resident: string | null): { resident(name: string): boolean; target(id: string): OtherTarget | null; named(name: string): OtherTarget | null } {
  return {
    resident: (name: string): boolean => resident !== null && name.toLowerCase() === resident.toLowerCase(),
    target: (): OtherTarget | null => null,
    named: (): OtherTarget | null => null,
  };
}

void test('a name clicked in chat opens the player menu for a player and never for a resident standing in the Hideout', (): void => {
  assert.equal(opensFor('Wren', null, hideoutWith(RESIDENT)), true);
  assert.equal(opensFor(RESIDENT, null, hideoutWith(RESIDENT)), false);
  assert.equal(opensFor('wayfarer', null, hideoutWith(RESIDENT)), false);
  assert.equal(opensFor(RESIDENT, null, hideoutWith(null)), true);
});

void test('a line the server marks as a resident’s opens no menu wherever the reader stands, and a player’s line still does', (): void => {
  const line: ChatLine = { id: 4, from: null, name: RESIDENT, text: 'the rain is late', at: null, own: false };
  assert.equal(opensFor(RESIDENT, { ...line, resident: true }, hideoutWith(null)), false);
  assert.equal(opensFor(RESIDENT, line, hideoutWith(null)), true);
  assert.equal(opensFor('Wren', { ...line, name: 'Wren' }, hideoutWith(null)), true);
});

void test('a resident is never a trade target, by its body or by its name', (): void => {
  const others = hideoutWith(RESIDENT);
  assert.equal(tradeTarget({ kind: 'chat', name: RESIDENT, line: null }, others), null);
  assert.equal(tradeTarget({ kind: 'world', target: { id: 'h1', name: RESIDENT, username: null } }, others), null);
});
