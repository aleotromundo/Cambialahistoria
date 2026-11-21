import assert from 'node:assert/strict';
import { test } from 'node:test';
import player from '../../data/player.json' with { type: 'json' };
import { problem, shipped } from '../../test/parse-support.ts';
import { parseContent } from './parse.ts';
import type { RawContent } from './parse.ts';
import type { Content } from './types.ts';

function withCaps(skillCaps: unknown): RawContent {
  return { ...shipped, player: { ...player, skillCaps } };
}

void test('the player lists skill caps by field with a floor, a ceiling or both', (): void => {
  const content: Content = parseContent(withCaps([{ field: 'cooldownPercent', min: -0.6 }, { field: 'areaPercent', max: 2 }, { field: 'chains', min: 0, max: 8 }]));
  assert.deepEqual(content.player.skillCaps, [{ field: 'cooldownPercent', min: -0.6, max: null }, { field: 'areaPercent', min: null, max: 2 }, { field: 'chains', min: 0, max: 8 }]);
});

void test('a skill cap with no bound, a floor above its ceiling or an unknown field is refused', (): void => {
  assert.throws((): Content => parseContent(withCaps([{ field: 'areaPercent' }])), (error: unknown): boolean => problem(error, 'player.skillCaps[0]'));
  assert.throws((): Content => parseContent(withCaps([{ field: 'areaPercent', min: 2, max: 1 }])), (error: unknown): boolean => problem(error, 'player.skillCaps[0]'));
  assert.throws((): Content => parseContent(withCaps([{ field: 'reach', max: 1 }])), (error: unknown): boolean => problem(error, 'player.skillCaps[0]'));
});
