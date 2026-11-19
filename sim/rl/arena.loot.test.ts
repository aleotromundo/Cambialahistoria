import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { dropOnGround } from '../world/ground.ts';
import type { Arena } from './arena.ts';
import { afterTick, ARENA, createArena } from './arena.ts';
import { REWARD } from './reward.ts';

const CONTENT: Content = loadContent();

function clearedArena(): Arena {
  const arena: Arena = createArena(CONTENT, { seed: 23, jitter: 0, waves: 1 });
  arena.world.monsters = [];
  arena.world.ground = [];
  return arena;
}

void test('the last wave cleared with gold on the ground leaves time to loot, then wins', (): void => {
  const arena: Arena = clearedArena();
  dropOnGround(arena.world, arena.world.player.pos, { kind: 'gold', amount: 5 });
  assert.equal(afterTick(arena, []), REWARD.wave + REWARD.win);
  assert.equal(arena.outcome, 'running');
  arena.world.time += ARENA.lootTime;
  assert.equal(afterTick(arena, []), 0);
  assert.equal(arena.outcome, 'won');
});

void test('the last wave cleared with nothing to loot wins at once', (): void => {
  const arena: Arena = clearedArena();
  afterTick(arena, []);
  assert.equal(arena.outcome, 'won');
});

void test('looting ends the moment the last gold is gone', (): void => {
  const arena: Arena = clearedArena();
  dropOnGround(arena.world, arena.world.player.pos, { kind: 'gold', amount: 5 });
  afterTick(arena, []);
  arena.world.ground = [];
  afterTick(arena, []);
  assert.equal(arena.outcome, 'won');
});
