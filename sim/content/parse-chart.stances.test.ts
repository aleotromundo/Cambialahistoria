import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chartDef, treeNode } from './parse-chart.ts';

const PLACE = { id: 'p', name: 'P', description: 'D', icon: 'focus', kind: 'notable', path: 'blade', column: 1, row: 1, requires: [], statMods: [], skillMods: [] };
const CHART = { title: 'T', pointsPerLevel: 2, revision: 1, respec: { goldPerPoint: 1, goldPerLevel: 1 }, grants: [], twist: 0, paths: [], groups: [], weaponGroups: [] };

void test('a place reads its stances, and has none when it names none', (): void => {
  assert.deepEqual(treeNode(PLACE, 'p').stances, []);
  const read = treeNode({ ...PLACE, stances: [{ when: 'low_life', statMods: [{ stat: 'armour', op: 'add', value: 20 }] }] }, 'p');
  assert.deepEqual(read.stances, [{ when: 'low_life', statMods: [{ stat: 'armour', op: 'add', value: 20 }] }]);
  assert.throws((): unknown => treeNode({ ...PLACE, stances: [{ when: 'flying', statMods: [] }] }, 'p'));
});

void test('a place reads the cluster it belongs to, and belongs to none when it names none', (): void => {
  assert.equal(treeNode(PLACE, 'p').cluster, null);
  assert.equal(treeNode({ ...PLACE, cluster: 'anvil' }, 'p').cluster, 'anvil');
});

void test('the chart reads its low life share, below the whole of life', (): void => {
  assert.equal(chartDef(CHART, 'chart').lowLife, 0.35);
  assert.equal(chartDef({ ...CHART, lowLife: 0.5 }, 'chart').lowLife, 0.5);
  assert.throws((): unknown => chartDef({ ...CHART, lowLife: 1 }, 'chart'));
});
