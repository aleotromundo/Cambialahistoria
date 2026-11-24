import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, SkillTreeNodeDef } from '../../sim/content/types.ts';
import { findNode } from '../../sim/progression.ts';
import { reachable } from './chart-parts.ts';
import { costLine, lockedLine, pointsPrompt, statusLine, takenLine, treeNodeStatus } from './tree-status.ts';

const CONTENT: Content = loadContent();

function node(id: string): SkillTreeNodeDef {
  const found: SkillTreeNodeDef | null = findNode(CONTENT, id);
  if (found === null) throw new Error(`no tree node ${id}`);
  return found;
}

void test('before the first pick only the starting places are open, and every other place reads as locked until it can begin', (): void => {
  assert.deepEqual(treeNodeStatus(CONTENT, [], 1, node('stone_thunderclap')), { kind: 'available' });
  assert.deepEqual(treeNodeStatus(CONTENT, [], 0, node('stone_thunderclap')), { kind: 'no_points' });
  assert.deepEqual(treeNodeStatus(CONTENT, [], 3, node('bedrock')), { kind: 'locked', needs: 'begin' });
  assert.deepEqual(treeNodeStatus(CONTENT, [], 3, node('storm_blade_near')), { kind: 'locked', needs: 'begin' });
  assert.equal(statusLine({ kind: 'locked', needs: 'begin' }, false), 'Primero asigna puntos en un lugar inicial');
  assert.equal(pointsPrompt(2, 0), 'Elige dónde empezar');
  assert.equal(pointsPrompt(2, 1), '2 puntos: elige un lugar');
  assert.equal(pointsPrompt(1, 3), '1 punto: elige un lugar');
});

void test('after the first pick a place is open only beside what is held, and the other centres lock', (): void => {
  const held: readonly string[] = ['stone_thunderclap'];
  assert.deepEqual(treeNodeStatus(CONTENT, held, 3, node('stone_thunderclap')), { kind: 'allocated' });
  assert.deepEqual(treeNodeStatus(CONTENT, held, 3, node('tempered_body')), { kind: 'available' });
  assert.deepEqual(treeNodeStatus(CONTENT, held, 3, node('storm_storm_bolt')), { kind: 'locked', needs: 'connect' });
  assert.deepEqual(treeNodeStatus(CONTENT, ['blade_thunderhead', 'heavy_hands', 'blade_1'], 1, node('storm_blade_near')), { kind: 'available' });
  assert.equal(statusLine({ kind: 'locked', needs: 'connect' }, false), 'Conéctalo con un lugar que ya tengas');
  assert.deepEqual(treeNodeStatus(CONTENT, ['storm_storm_bolt', 'blade_thunderhead', 'heavy_hands'], 1, node('stormcallers_focus')), { kind: 'locked', needs: 'branch' });
  assert.equal(statusLine({ kind: 'locked', needs: 'branch' }, false), 'Solo puede crecer tu grupo más grande de lugares');
  assert.equal(lockedLine({ kind: 'locked', needs: 'connect' }, 3, false), 'Conéctalo con un lugar que ya tengas · 3 puntos en la ruta iluminada');
  assert.equal(lockedLine({ kind: 'locked', needs: 'connect' }, 0, false), 'Conéctalo con un lugar que ya tengas');
});

void test('a taken place says why it cannot be given back', (): void => {
  assert.equal(takenLine(null), 'Asignado');
  assert.equal(takenLine('split'), 'Asignado · devolverlo desconectaría los lugares que siguen');
  assert.equal(takenLine('root'), 'Asignado · todos tus lugares dependen de este');
});

void test('the card lines name the cost and the reason', (): void => {
  assert.equal(costLine(), 'Costo: 1 punto de habilidad');
  assert.equal(statusLine({ kind: 'no_points' }, false), 'No tienes puntos de habilidad para gastar');
  assert.equal(statusLine({ kind: 'available' }, false), 'Haz clic para asignar');
  assert.equal(statusLine({ kind: 'available' }, true), 'Toca para asignar');
  assert.equal(statusLine({ kind: 'allocated' }, false), 'Asignado');
});

void test('a place that changes a skill a held place already changes is open like any other place', (): void => {
  const held: readonly string[] = ['storm_storm_bolt', 'stormcallers_focus', 'storm_1', 'forked_bolt', 'storm_4', 'twice_told_bolt'];
  assert.deepEqual(treeNodeStatus(CONTENT, held, 2, node('storm_lance')), { kind: 'available' });
  assert.deepEqual(treeNodeStatus(CONTENT, held, 0, node('storm_lance')), { kind: 'no_points' });
});

void test('no points is reported only when nothing else blocks the place', (): void => {
  assert.deepEqual(treeNodeStatus(CONTENT, ['stone_thunderclap'], 0, node('tempered_body')), { kind: 'no_points' });
  assert.deepEqual(treeNodeStatus(CONTENT, ['echo_storm_mid'], 0, node('storm_lance')), { kind: 'no_points' });
  assert.deepEqual(treeNodeStatus(CONTENT, ['echo_storm_mid'], 1, node('storm_lance')), { kind: 'available' });
  assert.equal(reachable({ kind: 'no_points' }), true);
  assert.equal(reachable({ kind: 'available' }), true);
  assert.equal(reachable({ kind: 'allocated' }), false);
  assert.equal(reachable({ kind: 'locked', needs: 'connect' }), false);
});
