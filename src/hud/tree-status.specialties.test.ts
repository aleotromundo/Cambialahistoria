import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, SkillTreeNodeDef } from '../../sim/content/types.ts';
import { findNode, placeLinks } from '../../sim/progression.ts';
import { reachable } from './chart-parts.ts';
import { lockedLine, statusLine, treeNodeStatus } from './tree-status.ts';

const CONTENT: Content = loadContent();

function node(id: string): SkillTreeNodeDef {
  const found: SkillTreeNodeDef | null = findNode(CONTENT, id);
  if (found === null) throw new Error(`no tree node ${id}`);
  return found;
}

function routeTo(target: string, start: string): string[] {
  const links: ReadonlyMap<string, readonly string[]> = placeLinks(CONTENT);
  const came: Map<string, string | null> = new Map<string, string | null>([[start, null]]);
  const queue: string[] = [start];
  for (let index: number = 0; index < queue.length; index += 1) {
    const at: string | undefined = queue[index];
    if (at === undefined || at === target) break;
    for (const next of links.get(at) ?? []) {
      if (came.has(next)) continue;
      came.set(next, at);
      queue.push(next);
    }
  }
  const route: string[] = [];
  let step: string | null = target;
  while (step !== null) {
    route.unshift(step);
    step = came.get(step) ?? null;
  }
  return route;
}

void test('a place of a fourth specialty reads as closed, names the three followed, and is never reachable', (): void => {
  const held: readonly string[] = [...routeTo('maelstrom_1', 'blade_thunderhead'), 'spring_tide_1', 'tidal_bore_1'];
  const status = treeNodeStatus(CONTENT, held, 4, node('hailfall_1'));
  assert.deepEqual(status, { kind: 'closed', chosen: ['The Maelstrom', 'The Spring Tide', 'The Tidal Bore'] });
  assert.equal(statusLine(status, false), 'Closed · you follow The Maelstrom, The Spring Tide and The Tidal Bore · give one up to follow this');
  assert.equal(lockedLine(status, 6, false), statusLine(status, false));
  assert.equal(reachable(status), false);
  assert.deepEqual(treeNodeStatus(CONTENT, held, 4, node('maelstrom_2')), { kind: 'available' });
  assert.deepEqual(treeNodeStatus(CONTENT, held.slice(0, -1), 4, node('tidal_bore_1')), { kind: 'available' });
  assert.notEqual(treeNodeStatus(CONTENT, held.slice(0, -1), 4, node('hailfall_1')).kind, 'closed');
});
