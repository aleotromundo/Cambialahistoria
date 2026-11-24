import assert from 'node:assert/strict';
import test from 'node:test';
import { dialogueHint, skipsVoice } from './dialogue-box.ts';

void test('the dialogue hint says click on a desk and tap on a phone', (): void => {
  assert.equal(dialogueHint(false, false), 'Haz clic para continuar');
  assert.equal(dialogueHint(true, false), 'Haz clic para cerrar');
  assert.equal(dialogueHint(false, true), 'Toca para continuar');
  assert.equal(dialogueHint(true, true), 'Toca para cerrar');
});

void test('closing a talk on purpose fades the line, and a talk broken off by walking, a hit or a new zone lets the line finish', (): void => {
  const closed = { type: 'dialogue_closed', npcId: 1, npc: 'warden_guide', talk: 'warden_first', replay: false } as const;
  assert.equal(skipsVoice({ ...closed, finished: true }), true);
  assert.equal(skipsVoice({ ...closed, finished: false }), false);
});
