import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Action } from '../../sim/rl/contract.ts';
import { LAYOUT, MOVE_CHOICES } from '../../sim/rl/contract.ts';
import type { RivalPilot } from '../../sim/rl/rival.ts';
import { RIVAL_MODEL, rivalPilotFrom } from './rival-model.ts';

const SHIPPED: Uint8Array = new Uint8Array(readFileSync(`public/${RIVAL_MODEL.path}`));

void test('the shipped model becomes a pilot that answers with a legal action', (): void => {
  const pilot: RivalPilot = rivalPilotFrom(SHIPPED);
  const action: Action = pilot(new Float32Array(LAYOUT.size), new Uint8Array(LAYOUT.mask).fill(1));
  assert.ok(Number.isInteger(action.move) && action.move >= 0 && action.move < MOVE_CHOICES);
});

void test('bytes that are not a model are refused', (): void => {
  assert.throws((): RivalPilot => rivalPilotFrom(new Uint8Array(16)), /magic/);
});
