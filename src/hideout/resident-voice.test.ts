import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LiveEvent } from '../backend/live.ts';
import type { ChatLine } from '../backend/live-protocol.ts';
import { createResidentVoice, lineToVoice, RESIDENT_VOICE, voiceUrl } from './resident-voice.ts';
import type { Ground } from './resident-voice.ts';

const KEY: string = 'b'.repeat(64);
const LINE: ChatLine = { id: 3, from: 'h1', name: 'Wayfarer', text: 'walk light', at: null, own: false, resident: true, voice: KEY };
const HERE: Ground = { x: 4, z: 5 };
const nearby = (): Ground | null => HERE;
const elsewhere = (): Ground | null => null;

function said(line: ChatLine): LiveEvent {
  return { type: 'said', line };
}

function settle(): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    setImmediate(resolve);
  });
}

void test('a resident’s voiced line is spoken only where he stands in the listener’s zone', (): void => {
  assert.deepEqual(lineToVoice(said(LINE), nearby), { line: LINE, voice: KEY });
  assert.equal(lineToVoice(said(LINE), elsewhere), null);
  assert.deepEqual(lineToVoice({ type: 'whisper', dir: 'from', with: 'Wayfarer', line: LINE }, nearby), { line: LINE, voice: KEY });
  assert.equal(lineToVoice({ type: 'whisper', dir: 'to', with: 'Wayfarer', line: LINE }, nearby), null);
});

void test('a line with no clip, from a player, or the listener’s own is never spoken', (): void => {
  const { voice: _unused, ...unvoiced } = LINE;
  assert.equal(_unused, KEY);
  assert.equal(lineToVoice(said(unvoiced), nearby), null);
  const { resident: _resident, ...player } = LINE;
  assert.equal(_resident, true);
  assert.equal(lineToVoice(said(player), nearby), null);
  assert.equal(lineToVoice(said({ ...LINE, own: true }), nearby), null);
});

void test('the clip is fetched from the server and played where he stands', async (): Promise<void> => {
  const asked: string[] = [];
  const spoken: Ground[] = [];
  const voice = createResidentVoice({
    serverUrl: 'https://example.test',
    fetch: (url: string): Promise<Response> => {
      asked.push(url);
      return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
    },
    standsAt: nearby,
    speak: (audio: ArrayBuffer, at: Ground): Promise<void> => {
      assert.equal(audio.byteLength, 3);
      spoken.push(at);
      return Promise.resolve();
    },
  });
  voice.handle(said(LINE));
  await settle();
  assert.deepEqual(asked, [voiceUrl('https://example.test', KEY)]);
  assert.equal(asked[0], `https://example.test${RESIDENT_VOICE.path}/${KEY}`);
  assert.deepEqual(spoken, [HERE]);
});

void test('a clip that fails to load, or a speaker who left before it arrived, stays silent', async (): Promise<void> => {
  let present: boolean = true;
  const spoken: number[] = [];
  const voice = createResidentVoice({
    serverUrl: 'https://example.test',
    fetch: (url: string): Promise<Response> => Promise.resolve(url.endsWith(KEY) ? new Response(new Uint8Array([1])) : new Response(null, { status: 404 })),
    standsAt: (): Ground | null => (present ? HERE : null),
    speak: (audio: ArrayBuffer): Promise<void> => {
      spoken.push(audio.byteLength);
      return Promise.resolve();
    },
  });
  voice.handle(said({ ...LINE, voice: 'c'.repeat(64) }));
  await settle();
  voice.handle(said(LINE));
  present = false;
  await settle();
  assert.deepEqual(spoken, []);
});

void test('lines play one after another and no more than a few wait', async (): Promise<void> => {
  const finish: (() => void)[] = [];
  let started: number = 0;
  const voice = createResidentVoice({
    serverUrl: 'https://example.test',
    fetch: (): Promise<Response> => Promise.resolve(new Response(new Uint8Array([1]))),
    standsAt: nearby,
    speak: (): Promise<void> => {
      started += 1;
      return new Promise<void>((resolve: () => void): void => {
        finish.push(resolve);
      });
    },
  });
  for (let line: number = 0; line < RESIDENT_VOICE.waiting + 2; line += 1) voice.handle(said({ ...LINE, id: line }));
  await settle();
  assert.equal(started, 1);
  finish[0]?.();
  await settle();
  assert.equal(started, 2);
  finish[1]?.();
  await settle();
  assert.equal(started, 2);
});
