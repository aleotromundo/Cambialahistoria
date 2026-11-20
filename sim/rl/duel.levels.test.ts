import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { Build } from './build.ts';
import type { Duel, DuelSeat } from './duel.ts';
import { createDuel } from './duel.ts';
import type { DuelReplay } from './duel-replay.ts';
import { readDuelReplay, recordDuelReplay, replayDuel } from './duel-replay.ts';

const CONTENT: Content = loadContent();
const SPIN: Build = { name: 'Spin', weapon: 'warden_broadsword', skills: ['thunderhead'], route: ['blade_thunderhead', 'heavy_hands', 'blade_1'], hero: null };

void test('a duel given a level plays both seats there, with or without builds', (): void => {
  for (const builds of [undefined, [SPIN, null]]) {
    const duel: Duel = createDuel(CONTENT, { seed: 21, jitter: 0, level: 18, ...(builds === undefined ? {} : { builds }) });
    assert.equal(duel.level, 18);
    for (const seat of duel.seats) assert.equal(seat.hero.level, 18);
  }
});

void test('a duel replay keeps the level it was played at', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: 22, jitter: 0, level: 16, builds: [SPIN, SPIN] });
  const record: DuelReplay = readDuelReplay(JSON.parse(JSON.stringify(recordDuelReplay(duel, [[], []], 'test'))));
  const again: Duel = replayDuel(CONTENT, record);
  assert.equal(again.level, 16);
  again.seats.forEach((seat: DuelSeat): void => assert.equal(seat.hero.level, 16));
});
