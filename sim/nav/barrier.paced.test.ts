import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import type { BarrierPiece } from './barrier.ts';
import { barrierPieces, barrierPiecesWork } from './barrier.ts';
import type { Work } from '../work.ts';

const content: Content = loadContent();

function zoneOf(id: string): ZoneDef {
  const zone: ZoneDef | undefined = content.zones.get(id);
  if (zone === undefined) throw new Error(`missing ${id}`);
  return { ...zone };
}

void test('an outdoor zone places its barrier a row at a time, and the pieces match the ones placed at once', (): void => {
  const zone: ZoneDef = zoneOf('keepers_gate');
  const work: Work<readonly BarrierPiece[]> = barrierPiecesWork(zone, content.props);
  let steps: number = 0;
  let step: IteratorResult<void, readonly BarrierPiece[]> = work.next();
  while (step.done !== true) {
    steps += 1;
    step = work.next();
  }
  assert.ok(steps > 10, `only ${steps} steps`);
  assert.ok(step.value.length > 0);
  assert.deepEqual(step.value, barrierPieces(zoneOf('keepers_gate'), content.props));
  assert.equal(barrierPieces(zone, content.props), step.value);
});
