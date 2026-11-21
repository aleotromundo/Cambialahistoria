import assert from 'node:assert/strict';
import { test } from 'node:test';
import { texturePath } from '../mobile/quality.ts';
import { TEXTURE_SET } from './texture-set.ts';
import { TEXTURE_SET as HALF } from './texture-set-half.ts';

void test('the site and most portals load each surface at the size the quality tier picks', (): void => {
  assert.deepEqual(TEXTURE_SET, { halfOnly: false });
});

void test('a build that ships only the half-size set always loads from it', (): void => {
  assert.deepEqual(HALF, { halfOnly: true });
  assert.equal(texturePath('textures/iron_color.webp', HALF.halfOnly), 'textures/half/iron_color.webp');
});
