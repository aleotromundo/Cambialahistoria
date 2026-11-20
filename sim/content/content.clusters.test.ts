import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content.ts';
import type { Content, PowerTriggerDef, SkillTreeNodeDef } from './types.ts';

const content: Content = loadContent();

function changesPlay(node: SkillTreeNodeDef): boolean {
  return node.triggers.length > 0 || node.variants.length > 0 || node.stances.length > 0 || node.unlock !== null || node.skillMods.some((mod): boolean => mod.field === 'pull' || mod.field === 'echo');
}

function clusters(): Map<string, SkillTreeNodeDef[]> {
  const found: Map<string, SkillTreeNodeDef[]> = new Map<string, SkillTreeNodeDef[]>();
  for (const node of content.skillTree) if (node.cluster !== null) found.set(node.cluster, [...(found.get(node.cluster) ?? []), node]);
  return found;
}

void test('every path has two clusters beside it, each with named places and a keystone that changes how the build plays', (): void => {
  const groups: Map<string, SkillTreeNodeDef[]> = clusters();
  for (const path of content.chart.paths) {
    const own: SkillTreeNodeDef[][] = [...groups.values()].filter((places: readonly SkillTreeNodeDef[]): boolean => places.some((node: SkillTreeNodeDef): boolean => node.kind === 'keystone' && node.path === path.id));
    assert.ok(own.length >= 2, `${path.id} has ${own.length} clusters`);
    for (const places of own) {
      assert.ok(places.filter((node: SkillTreeNodeDef): boolean => node.kind === 'notable').length >= 2, `${places[0]?.cluster ?? ''} notables`);
      const keystone: SkillTreeNodeDef | undefined = places.find((node: SkillTreeNodeDef): boolean => node.kind === 'keystone');
      assert.ok(keystone !== undefined && changesPlay(keystone), `${places[0]?.cluster ?? ''} keystone changes how the build plays`);
      assert.ok(new Set<string>(places.filter((node: SkillTreeNodeDef): boolean => node.kind === 'minor').map((node: SkillTreeNodeDef): string => node.name)).size >= 3, `${places[0]?.cluster ?? ''} minors vary`);
    }
  }
});

void test('clusters of neighbouring paths are bridged, so a build can cross from one weapon to another', (): void => {
  const pathOf: ReadonlyMap<string, string> = new Map<string, string>(content.skillTree.map((node: SkillTreeNodeDef): [string, string] => [node.id, node.path]));
  const clusterOf: ReadonlyMap<string, string | null> = new Map<string, string | null>(content.skillTree.map((node: SkillTreeNodeDef): [string, string | null] => [node.id, node.cluster]));
  const bridges: number = content.skillTree.filter((node: SkillTreeNodeDef): boolean => node.cluster !== null && node.requires.some((id: string): boolean => clusterOf.get(id) !== null && clusterOf.get(id) !== node.cluster && pathOf.get(id) !== node.path)).length;
  assert.ok(bridges >= 4, `${bridges} bridges`);
});

void test('the tree uses every kind of place effect: stances, restores, casts, skill changes and new skills', (): void => {
  const triggers: readonly PowerTriggerDef[] = content.skillTree.flatMap((node: SkillTreeNodeDef): readonly PowerTriggerDef[] => node.triggers);
  for (const stance of ['moving', 'still', 'low_life', 'full_life']) assert.ok(content.skillTree.some((node: SkillTreeNodeDef): boolean => node.stances.some((mod): boolean => mod.when === stance)), stance);
  for (const kind of ['restore', 'cast', 'buff', 'empower', 'flask']) assert.ok(triggers.some((trigger: PowerTriggerDef): boolean => trigger.effect.type === kind), kind);
  for (const skill of ['mist_step', 'living_wire']) assert.ok(content.skillTree.some((node: SkillTreeNodeDef): boolean => node.unlock === skill), skill);
  assert.ok(content.skillTree.some((node: SkillTreeNodeDef): boolean => node.cluster !== null && node.variants.length > 0));
});
