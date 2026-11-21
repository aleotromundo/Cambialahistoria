import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content/content.ts';
import type { Content, SkillDef } from './content/types.ts';
import { cappedSkillMod, resolveSkill } from './stats.ts';

const content: Content = loadContent();
const ROLL_COOLDOWN: readonly string[] = ['windborne', 'shadow_dancer', 'static_step', 'never_still'];

function roll(): SkillDef {
  const skill: SkillDef | undefined = content.skills.get('dodge_roll');
  if (skill === undefined) throw new Error('no dodge_roll');
  return skill;
}

void test('a skill cap holds a field between its floor and its ceiling and leaves other fields alone', (): void => {
  const caps = [{ field: 'cooldownPercent' as const, min: -0.6, max: null }, { field: 'chains' as const, min: null, max: 8 }];
  assert.equal(cappedSkillMod(caps, 'cooldownPercent', -1.2), -0.6);
  assert.equal(cappedSkillMod(caps, 'cooldownPercent', -0.3), -0.3);
  assert.equal(cappedSkillMod(caps, 'chains', 11), 8);
  assert.equal(cappedSkillMod(caps, 'areaPercent', 5), 5);
});

void test('places that would cut a cooldown to nothing stop at the player\'s cooldown floor', (): void => {
  const floor: number | null = content.player.skillCaps.find((cap): boolean => cap.field === 'cooldownPercent')?.min ?? null;
  assert.ok(floor !== null);
  const capped: SkillDef = resolveSkill(content, roll(), ROLL_COOLDOWN);
  assert.ok(Math.abs(capped.cooldown - roll().cooldown * (1 + floor)) < 1e-9);
  const open: Content = { ...content, player: { ...content.player, skillCaps: [] } };
  assert.equal(resolveSkill(open, roll(), ROLL_COOLDOWN).cooldown, 0);
});
