import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content/content.ts';
import type { Content } from './content/types.ts';
import { RING, ringContent, ringWorld } from '../test/rival-support.ts';
import { startRivalDuel } from './rl/rival.ts';
import { toSave } from './save.ts';

const CONTENT: Content = ringContent(loadContent());

void test('a save made in a duel zone records the way home, never the arena', (): void => {
  const world = ringWorld(CONTENT, 5, 9);
  startRivalDuel(world, 5);
  const saved = toSave(world);
  assert.equal(saved.zone, RING.home.zone);
  assert.deepEqual(saved.respawn, { type: 'exit', exit: RING.home.exit });
});
