import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOST } from './host.ts';
import { HOST as FRAMED } from './host-framed.ts';
import { HOST as PLAYGAMA } from './host-playgama.ts';

void test('the site and the open portals run on when hidden, leave desktop touch alone and keep Esc as the only menu key', (): void => {
  assert.deepEqual(HOST, { pauseWhenHidden: false, stillPage: false, menuKeys: [] });
});

void test('a framed host pauses while its page is hidden and holds the page still on every device', (): void => {
  assert.deepEqual(FRAMED, { pauseWhenHidden: true, stillPage: true, menuKeys: [] });
});

void test('Playgama, which keeps Esc for leaving full screen, also opens the menu on P', (): void => {
  assert.deepEqual(PLAYGAMA, { pauseWhenHidden: true, stillPage: true, menuKeys: ['KeyP'] });
});
