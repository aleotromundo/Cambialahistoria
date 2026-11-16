import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, SkillTreeNodeDef } from '../../sim/content/types.ts';
import { changesShape, needTag, placeChanges, skillChanges, slotNeed } from './skill-changes.ts';
import type { ChangeChoice, ChangeOwner, SkillChanges } from './skill-changes.ts';

const content: Content = loadContent();
const both: readonly string[] = ['storm_lance', 'twice_told_bolt'];

function owner(allocated: readonly string[], changes: Readonly<Record<string, string>>, wielding: string | null): ChangeOwner {
  return { allocated, changes, wielding };
}

function node(id: string): SkillTreeNodeDef {
  return must(content.skillTree.find((entry: SkillTreeNodeDef): boolean => entry.id === id), id);
}

void test('a skill with two changes offers both by place name, lights the first taken, and dims one the weapon in hand turns off', (): void => {
  const choices: SkillChanges = must(skillChanges(content, owner(both, {}, 'blade'), 'storm_bolt'), 'storm bolt changes');
  assert.equal(choices.title, 'Storm Bolt uses');
  assert.deepEqual(
    choices.choices.map((choice: ChangeChoice): readonly [string, boolean, boolean] => [choice.name, choice.lit, choice.live]),
    [
      ['Storm Lance', true, true],
      ['Twice-Told Bolt', false, false],
    ],
  );
  const chosen: SkillChanges = must(skillChanges(content, owner(both, { storm_bolt: 'storm_bolt_echo' }, 'staff'), 'storm_bolt'), 'chosen');
  assert.deepEqual(
    chosen.choices.map((choice: ChangeChoice): boolean => choice.lit),
    [false, true],
  );
  const blocked: SkillChanges = must(skillChanges(content, owner(both, { storm_bolt: 'storm_bolt_echo' }, 'blade'), 'storm_bolt'), 'blocked');
  assert.deepEqual(
    blocked.choices.map((choice: ChangeChoice): boolean => choice.lit),
    [true, false],
  );
  assert.equal(skillChanges(content, owner(['storm_lance'], {}, 'staff'), 'storm_bolt'), null);
});

void test('a card shows the choice only once its place is taken, and its shape changes only with the changes held', (): void => {
  assert.deepEqual(placeChanges(content, owner(['storm_lance'], {}, 'staff'), node('twice_told_bolt')), []);
  const shown: readonly SkillChanges[] = placeChanges(content, owner(both, {}, 'staff'), node('twice_told_bolt'));
  assert.equal(shown.length, 1);
  assert.equal(changesShape(shown), 'storm_bolt=storm_bolt_lance|storm_bolt_echo');
  assert.equal(changesShape(placeChanges(content, owner(both, { storm_bolt: 'storm_bolt_echo' }, 'staff'), node('storm_lance'))), changesShape(shown));
});

void test('a slot is tagged with the weapon its skill or its chosen change needs, and with nothing when the hand fits', (): void => {
  assert.equal(needTag(content, ['staff'], 'blade'), 'Staff');
  assert.equal(needTag(content, ['staff', 'blade'], null), 'Blade / Staff');
  assert.equal(needTag(content, ['staff'], 'staff'), null);
  assert.equal(needTag(content, [], 'blade'), null);
  assert.deepEqual(slotNeed(content, owner(['twice_told_bolt'], {}, 'blade'), 'storm_bolt', []), { tag: 'Staff', line: 'Twice-Told Bolt needs a staff' });
  assert.equal(slotNeed(content, owner(['twice_told_bolt'], {}, 'staff'), 'storm_bolt', []), null);
  assert.equal(slotNeed(content, owner(both, { storm_bolt: 'storm_bolt_echo' }, 'blade'), 'storm_bolt', []), null);
  assert.deepEqual(slotNeed(content, owner([], {}, 'blade'), 'storm_bolt', ['staff']), { tag: 'Staff', line: 'Needs a staff' });
});
