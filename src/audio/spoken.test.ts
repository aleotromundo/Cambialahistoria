import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placedGain } from './spoken.ts';

void test('a spoken line is as loud as a voice line at the speaker’s distance', (): void => {
  assert.equal(placedGain(0.8, { gain: 1, pan: 0 }), 0.8);
  assert.equal(placedGain(0.8, { gain: 0.5, pan: -0.3 }), 0.4);
  assert.equal(placedGain(0.8, { gain: 0, pan: 1 }), 0);
});
