import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChatLine } from '../backend/live-protocol.ts';
import { isResidentName } from './chat.ts';

const LINE: ChatLine = { id: 1, from: null, name: 'Wayfarer', text: 'evening', at: null, own: false };

void test('a name is a resident’s when its line is marked, or when a marked line under that name was seen before', (): void => {
  const none: ReadonlySet<string> = new Set<string>();
  assert.equal(isResidentName('Wayfarer', { ...LINE, resident: true }, none), true);
  assert.equal(isResidentName('Wayfarer', LINE, none), false);
  assert.equal(isResidentName('Wayfarer', null, none), false);
  const seen: ReadonlySet<string> = new Set<string>(['wayfarer']);
  assert.equal(isResidentName('Wayfarer', null, seen), true);
  assert.equal(isResidentName('WAYFARER', LINE, seen), true);
  assert.equal(isResidentName('Wren', { ...LINE, name: 'Wren' }, seen), false);
});

void test('a whisper to a resident drawn before it answered stops being a player’s name once its marked answer is seen', (): void => {
  const known: Set<string> = new Set<string>();
  const toRow: { readonly name: string; readonly line: ChatLine | null } = { name: 'Wayfarer', line: null };
  assert.equal(isResidentName(toRow.name, toRow.line, known), false);
  const answer: ChatLine = { ...LINE, id: 2, resident: true };
  if (answer.resident === true) known.add(answer.name.toLowerCase());
  assert.equal(isResidentName(toRow.name, toRow.line, known), true);
});

