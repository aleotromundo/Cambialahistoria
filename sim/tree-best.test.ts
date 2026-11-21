import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content/content.ts';
import type { Content, SkillTreeNodeDef } from './content/types.ts';
import { canAllocate } from './progression.ts';
import { basicSkill, bookSkills, buildPoints } from './rl/build.ts';
import { DUEL_KIT } from './rl/kit.ts';
import type { ScoredBuild } from './tree-best.ts';
import { completeBuild, legalBar, pathWeapon, scoreBuild, treeLift } from './tree-best.ts';
import { bestStack } from './tree-stack.ts';

const content: Content = loadContent();
const LEVEL: number = 30;

function weaponFor(path: string): string {
  const weapon: string | null = pathWeapon(content, DUEL_KIT, path);
  if (weapon === null) throw new Error(`no standard weapon for ${path}`);
  return weapon;
}

function unlockPlace(): SkillTreeNodeDef {
  const place: SkillTreeNodeDef | undefined = content.skillTree.find((node: SkillTreeNodeDef): boolean => node.unlock !== null && node.requires.length === 0 && !bookSkills(content, LEVEL).includes(node.unlock));
  if (place === undefined) throw new Error('no starting place that unlocks a skill');
  return place;
}

void test('every arm a standard weapon is drawn for has that weapon', (): void => {
  for (const group of content.chart.weaponGroups) assert.ok(DUEL_KIT.weapons.includes(weaponFor(group.path)), group.path);
});

void test('the bar a build is scored with holds the basic attack, the book and the skills its route unlocks', (): void => {
  const place: SkillTreeNodeDef = unlockPlace();
  const bare: readonly string[] = legalBar(content, [], LEVEL);
  assert.equal(bare[0], basicSkill(content));
  assert.ok(place.unlock !== null && !bare.includes(place.unlock));
  assert.ok(legalBar(content, [place.id], LEVEL).includes(place.unlock));
});

void test('a build\'s score is its lead skill\'s damage times its effective life, and a bare hero lifts by one', (): void => {
  const weapon: string = weaponFor('stone');
  const bare: ScoredBuild = scoreBuild(content, DUEL_KIT, weapon, [], LEVEL);
  assert.ok(bare.damage > 0 && bare.toughness > 0);
  assert.ok(Math.abs(bare.score - bare.damage * bare.toughness) < 1e-6 * bare.score);
  assert.ok(Math.abs(treeLift(content, DUEL_KIT, bare, LEVEL) - 1) < 1e-9);
  const life: readonly string[] = bestStack(content, (node: SkillTreeNodeDef): number => node.statMods.filter((mod): boolean => mod.stat === 'maxLife' && mod.op === 'add').reduce((sum: number, mod): number => sum + mod.value, 0), 10).route;
  assert.ok(scoreBuild(content, DUEL_KIT, weapon, life, LEVEL).toughness > bare.toughness);
});

void test('a completed build keeps its route, spends every point and could be taken in that order', (): void => {
  const start: readonly string[] = bestStack(content, (node: SkillTreeNodeDef): number => (node.path === 'blade' ? 1 : 0), 12).route;
  const weapon: string = weaponFor('blade');
  const done: ScoredBuild = completeBuild(content, DUEL_KIT, weapon, start, LEVEL);
  const points: number = buildPoints(content, LEVEL);
  assert.deepEqual(done.route.slice(0, start.length), start);
  assert.equal(done.route.length, points);
  assert.ok(done.route.every((id: string, index: number): boolean => canAllocate(content, done.route.slice(0, index), points - index, id)));
  assert.ok(done.score > scoreBuild(content, DUEL_KIT, weapon, start, LEVEL).score);
});
