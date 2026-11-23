import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingLines, threeFunction, threeSource } from '../../test/three-source-support.ts';
import type { HeldProgram, ProgramOwner } from './held-programs.ts';
import { holdPrograms } from './held-programs.ts';

interface FakeOwner extends ProgramOwner {
  readonly info: { programs: HeldProgram[] | null };
}

function ownerOf(...programs: HeldProgram[]): FakeOwner {
  return { info: { programs } };
}

function release(owner: FakeOwner, program: HeldProgram): void {
  program.usedTimes -= 1;
  if (program.usedTimes === 0) owner.info.programs = (owner.info.programs ?? []).filter((kept: HeldProgram): boolean => kept !== program);
}

void test('a held program outlives the last material that used it, so a zone change never deletes a program the next zone draws with', (): void => {
  const program: HeldProgram = { usedTimes: 1 };
  const owner: FakeOwner = ownerOf(program);
  assert.equal(holdPrograms(owner), 1);
  release(owner, program);
  assert.deepEqual(owner.info.programs, [program]);
});

void test('each program is held once however often the renderer is asked', (): void => {
  const program: HeldProgram = { usedTimes: 1 };
  const owner: FakeOwner = ownerOf(program);
  holdPrograms(owner);
  holdPrograms(owner);
  owner.info.programs = [program];
  holdPrograms(owner);
  assert.equal(program.usedTimes, 2);
});

void test('a program built after the last hold is held on the next', (): void => {
  const first: HeldProgram = { usedTimes: 1 };
  const owner: FakeOwner = ownerOf(first);
  holdPrograms(owner);
  const later: HeldProgram = { usedTimes: 1 };
  owner.info.programs = [first, later];
  assert.equal(holdPrograms(owner), 1);
  assert.equal(later.usedTimes, 2);
});

void test('a renderer with no programs yet holds nothing', (): void => {
  const owner: FakeOwner = { info: { programs: null } };
  assert.equal(holdPrograms(owner), 0);
});

void test('three still deletes a program only when its use count reaches zero, and reuses a kept program for the same key', (): void => {
  const programs: string = threeSource('renderers', 'webgl', 'WebGLPrograms.js');
  assert.deepEqual(missingLines(threeFunction(programs, 'function releaseProgram'), ['if ( -- program.usedTimes === 0 ) {', 'program.destroy();']), []);
  assert.deepEqual(missingLines(threeFunction(programs, 'function acquireProgram'), ['let program = programsMap.get( cacheKey );', '++ program.usedTimes;', 'programs.push( program );']), []);
});

void test('the renderer still lists its programs in info, which is where they are held', (): void => {
  assert.deepEqual(missingLines(threeSource('renderers', 'WebGLRenderer.js'), ['info.programs = programCache.programs;']), []);
});
