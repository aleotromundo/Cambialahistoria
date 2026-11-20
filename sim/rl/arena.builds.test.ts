import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { Arena } from './arena.ts';
import { createArena } from './arena.ts';
import type { Build } from './build.ts';
import { BUILD } from './build.ts';
import type { Replay } from './replay.ts';
import { readReplay, recordReplay, replayArena } from './replay.ts';

const CONTENT: Content = loadContent();
const SPIN: Build = { name: 'Spin', weapon: 'warden_broadsword', skills: ['thunderhead'], route: ['blade_thunderhead', 'heavy_hands', 'blade_1'], hero: null };
const SEEDS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8];

void test('an arena with a build runs its hero and its zone at the duel level, or at the level asked, never jittered', (): void => {
  for (const seed of SEEDS) {
    for (const [asked, level] of [[undefined, BUILD.level], [7, 7]] as const) {
      const arena: Arena = createArena(CONTENT, { seed, jitter: 0.2, waves: 1, build: SPIN, ...(asked === undefined ? {} : { level: asked }) });
      assert.equal(arena.level, level);
      assert.equal(arena.world.player.level, level);
      assert.equal(arena.world.zone.level, level);
      assert.deepEqual(arena.world.player.allocated, SPIN.route);
    }
  }
});

void test('an arena replay keeps its build and plays the same hero again', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 9, jitter: 0, waves: 1, build: SPIN });
  const record: Replay = readReplay(JSON.parse(JSON.stringify(recordReplay(arena, [], 'test'))));
  assert.deepEqual(record.options.build, SPIN);
  assert.deepEqual(replayArena(CONTENT, record).world.player.stats, arena.world.player.stats);
});
