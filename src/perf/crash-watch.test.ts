import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EVENTS_PROTOCOL, PLAYER_EVENT_KINDS } from '../backend/api.ts';
import type { PlayerEventBody } from '../backend/api.ts';
import { CRASH_WATCH, crashEvent, errorEvent, heapMegabytes, printable, readMarks, sourceFile, takeCrashes, withMark, writeMarks } from './crash-watch.ts';
import type { AliveMark, TakenCrashes } from './crash-watch.ts';

const NOW: number = Date.UTC(2026, 10, 21, 12);

function mark(overrides: Partial<AliveMark> = {}): AliveMark {
  return { play: 'a'.repeat(32), build: 'b1', zone: 'lava_depths', tier: 'mobile', startedAt: NOW - 600_000, beatAt: NOW - 60_000, hidden: false, closed: false, heapMb: -1, textures: 140, geometries: 900, ...overrides };
}

void test('marks survive a write and a read, and junk reads as none', (): void => {
  const marks: AliveMark[] = [mark(), mark({ play: 'b'.repeat(32), hidden: true })];
  assert.deepEqual(readMarks(writeMarks(marks)), marks);
  assert.deepEqual(readMarks(null), []);
  assert.deepEqual(readMarks('not json'), []);
  assert.deepEqual(readMarks('{"play":"x"}'), []);
  assert.deepEqual(readMarks(JSON.stringify([{ ...mark(), textures: 'many' }, mark()])), [mark()]);
});

void test('a play keeps one mark, and only the newest few are kept', (): void => {
  let marks: AliveMark[] = [];
  for (let index: number = 0; index < CRASH_WATCH.most + 2; index += 1) marks = withMark(marks, mark({ play: String(index), beatAt: NOW + index }));
  assert.equal(marks.length, CRASH_WATCH.most);
  assert.equal(marks[0]?.play, String(CRASH_WATCH.most + 1));
  marks = withMark(marks, mark({ play: String(CRASH_WATCH.most), zone: 'hideout' }));
  assert.equal(marks.length, CRASH_WATCH.most);
  assert.equal(marks.filter((known: AliveMark): boolean => known.play === String(CRASH_WATCH.most)).length, 1);
  assert.equal(marks[0]?.zone, 'hideout');
});

void test('a play that never closed and holds no lock is reported as a crash', (): void => {
  const taken: TakenCrashes = takeCrashes([mark()], 'own', new Set<string>(), NOW);
  assert.deepEqual(taken.kept, []);
  assert.deepEqual(taken.crashes, [
    { kind: 'crashed', at: NOW - 60_000, zone: 'lava_depths', fields: { play: 'a'.repeat(32), build: 'b1', up_s: 540, hidden: false, heap_mb: -1, textures: 140, geometries: 900, tier: 'mobile' } },
  ]);
});

void test('a closed play, the page itself and a play that holds its lock are never crashes', (): void => {
  const other: AliveMark = mark({ play: 'c'.repeat(32) });
  const taken: TakenCrashes = takeCrashes([mark({ closed: true }), mark({ play: 'own' }), other], 'own', new Set<string>([other.play]), NOW);
  assert.deepEqual(taken.crashes, []);
  assert.deepEqual(taken.kept, [other]);
});

void test('with no lock list a recent beat counts as alive and an old one as a crash', (): void => {
  const fresh: AliveMark = mark({ play: 'fresh', beatAt: NOW - CRASH_WATCH.staleMs + 1 });
  const stale: AliveMark = mark({ play: 'stale', beatAt: NOW - CRASH_WATCH.staleMs - 1 });
  const taken: TakenCrashes = takeCrashes([fresh, stale], 'own', null, NOW);
  assert.deepEqual(taken.kept, [fresh]);
  assert.deepEqual(
    taken.crashes.map((event: PlayerEventBody): unknown => event.fields['play']),
    ['stale'],
  );
});

void test('a crash older than the server takes is dropped quietly', (): void => {
  const taken: TakenCrashes = takeCrashes([mark({ beatAt: NOW - CRASH_WATCH.pastMs - 1 })], 'own', new Set<string>(), NOW);
  assert.deepEqual(taken, { crashes: [], kept: [] });
});

void test('a crash event fits what the server reads', (): void => {
  const event: PlayerEventBody = crashEvent(mark({ zone: 'not a zone', build: 'béta', startedAt: NOW, beatAt: NOW - 5 }));
  assert.equal(event.zone, 'unknown');
  assert.equal(event.fields['build'], 'b?ta');
  assert.equal(event.fields['up_s'], 0);
  assert.ok(Object.keys(event.fields).length <= EVENTS_PROTOCOL.maxFields);
  assert.ok(PLAYER_EVENT_KINDS.includes(event.kind));
});

void test('a script error is clipped to printable text and names only the file', (): void => {
  const event: PlayerEventBody = errorEvent({ message: `x is undefined — ${'z'.repeat(100)}`, file: 'https://theloststorm.com/assets/main-abc.js?v=2#top', line: 12.4 }, 'hideout', NOW + 0.6);
  assert.equal(event.kind, 'error');
  assert.equal(event.at, NOW + 1);
  assert.equal(event.zone, 'hideout');
  assert.equal(event.fields['file'], 'main-abc.js');
  assert.equal(event.fields['line'], 12);
  const message: unknown = event.fields['message'];
  assert.equal(typeof message === 'string' ? message.length : 0, EVENTS_PROTOCOL.textChars);
  assert.equal(typeof message === 'string' && message.startsWith('x is undefined ? '), true);
});

void test('helpers handle the edges', (): void => {
  assert.equal(sourceFile(''), '');
  assert.equal(sourceFile('main.js'), 'main.js');
  assert.equal(printable('ok'), 'ok');
  assert.equal(heapMegabytes(null), CRASH_WATCH.unknown);
  assert.equal(heapMegabytes(3 * CRASH_WATCH.bytesPerMb), 3);
});
