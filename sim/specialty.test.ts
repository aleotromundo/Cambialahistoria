import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content/content.ts';
import type { Content, SkillTreeNodeDef, SpecialtyDef } from './content/types.ts';
import { adoptLearned, canAllocate, placeLinks, reachablePlaces } from './progression.ts';
import { earnedPoints } from './save.ts';
import { armPlaces, armTip, closingSpecialties, farthestPlace, heldSpecialties, opensSpecialty, specialtyClosed, specialtyPlaces, withinSpecialtyLimit } from './specialty.ts';

const content: Content = loadContent();

function routeTo(target: string, start: string): string[] {
  const links: ReadonlyMap<string, readonly string[]> = placeLinks(content);
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

function first(id: string): string {
  const own: readonly SkillTreeNodeDef[] = specialtyPlaces(content, id);
  const entry: SkillTreeNodeDef | undefined = own.find((node: SkillTreeNodeDef): boolean => node.requires.every((other: string): boolean => !own.some((place: SkillTreeNodeDef): boolean => place.id === other)));
  assert.ok(entry !== undefined, id);
  return entry.id;
}

function changesPlay(node: SkillTreeNodeDef): boolean {
  return node.triggers.length > 0 || node.variants.length > 0 || node.unlock !== null || node.skillMods.some((mod): boolean => mod.field === 'pull');
}

void test('every weapon arm splits into three specialties, each a long branching lane that changes how the build plays from its first place', (): void => {
  for (const arm of ['stone', 'storm', 'blade', 'wind']) {
    const own: readonly SpecialtyDef[] = content.chart.specialties.filter((entry: SpecialtyDef): boolean => entry.path === arm);
    assert.equal(own.length, 3, arm);
    for (const specialty of own) {
      const places: readonly SkillTreeNodeDef[] = specialtyPlaces(content, specialty.id);
      assert.ok(places.length >= 40, `${specialty.id} has ${places.length} places`);
      assert.ok(places.filter((node: SkillTreeNodeDef): boolean => node.kind === 'notable').length >= 8, `${specialty.id} notables`);
      const keystones: readonly SkillTreeNodeDef[] = places.filter((node: SkillTreeNodeDef): boolean => node.kind === 'keystone');
      assert.ok(keystones.length >= 3, `${specialty.id} has ${keystones.length} keystones`);
      for (const keystone of keystones) assert.ok(changesPlay(keystone), `${keystone.id} changes how the build plays`);
      const door: SkillTreeNodeDef | undefined = places.find((node: SkillTreeNodeDef): boolean => node.id === first(specialty.id));
      assert.ok(door !== undefined && door.kind === 'notable' && changesPlay(door), `${specialty.id} opens on a place that changes how the build plays`);
      const ends: number = places.filter((node: SkillTreeNodeDef): boolean => !places.some((other: SkillTreeNodeDef): boolean => other.requires.includes(node.id))).length;
      assert.ok(ends >= 4, `${specialty.id} branches into ${ends} ends`);
    }
  }
});

void test('a specialty grows from the end of its own arm', (): void => {
  for (const specialty of content.chart.specialties) {
    const entry: SkillTreeNodeDef | undefined = content.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === first(specialty.id));
    assert.ok(entry !== undefined);
    for (const before of entry.requires) {
      const gate: SkillTreeNodeDef | undefined = content.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === before);
      assert.ok(gate !== undefined && gate.path === specialty.path && gate.specialty === null && gate.common === null, `${specialty.id} grows from ${before}`);
    }
    const end: SkillTreeNodeDef | null = farthestPlace(armPlaces(content, specialty.path));
    assert.ok(end !== null);
    assert.ok(Math.hypot(entry.column, entry.row) > Math.hypot(end.column, end.row) - 1, `${specialty.id} lies past its arm`);
  }
});

void test('the place an arm is named at is the end of the arm, short of the place its specialties open from', (): void => {
  for (const path of new Set<string>(content.chart.specialties.map((entry: SpecialtyDef): string => entry.path))) {
    const tip: SkillTreeNodeDef | null = armTip(content, path);
    assert.ok(tip !== null);
    assert.equal(opensSpecialty(content, tip), false);
    const gates: readonly SkillTreeNodeDef[] = armPlaces(content, path).filter((node: SkillTreeNodeDef): boolean => opensSpecialty(content, node));
    assert.ok(gates.length > 0, `${path} opens a specialty`);
    for (const gate of gates) assert.ok(Math.hypot(gate.column, gate.row) > Math.hypot(tip.column, tip.row), `${gate.id} lies past ${tip.id}`);
  }
});

void test('a hero follows up to three specialties, all in one arm or across arms, and a fourth stays closed until one is given up', (): void => {
  assert.equal(content.chart.specialtyLimit, 3);
  const route: readonly string[] = routeTo(first('maelstrom'), 'blade_thunderhead');
  assert.deepEqual(heldSpecialties(content, route.slice(0, -1)), []);
  assert.equal(canAllocate(content, route, 5, first('spring_tide')), true);
  const three: readonly string[] = [...route, first('spring_tide'), first('tidal_bore')];
  assert.equal(canAllocate(content, [...route, first('spring_tide')], 5, first('tidal_bore')), true);
  assert.deepEqual(heldSpecialties(content, three), ['maelstrom', 'spring_tide', 'tidal_bore']);
  const closed: readonly string[] = content.chart.specialties.filter((entry: SpecialtyDef): boolean => specialtyPlaces(content, entry.id).some((node: SkillTreeNodeDef): boolean => specialtyClosed(content, three, node))).map((entry: SpecialtyDef): string => entry.id);
  assert.equal(closed.length, content.chart.specialties.length - 3);
  assert.ok(!closed.includes('maelstrom') && !closed.includes('tidal_bore'));
  const far: SkillTreeNodeDef | undefined = specialtyPlaces(content, 'hailfall')[0];
  assert.ok(far !== undefined);
  assert.deepEqual(closingSpecialties(content, three, far).map((entry: SpecialtyDef): string => entry.id), ['maelstrom', 'spring_tide', 'tidal_bore']);
  assert.equal(specialtyClosed(content, three.slice(0, -1), far), false);
  const crossing: readonly string[] = [...route, first('spring_tide')];
  const kiln: readonly string[] = routeTo(first('kiln'), 'blade_thunderhead').filter((id: string): boolean => !crossing.includes(id));
  assert.deepEqual(heldSpecialties(content, [...crossing, ...kiln]), ['maelstrom', 'spring_tide', 'kiln']);
});

void test('places outside the specialties never close', (): void => {
  const route: readonly string[] = routeTo(first('hailfall'), 'stone_thunderclap');
  for (const node of content.skillTree) if (node.specialty === null) assert.equal(specialtyClosed(content, route, node), false, node.id);
});

void test('giving back every place of one followed specialty opens the others again', (): void => {
  const route: readonly string[] = [...routeTo(first('kiln'), 'stone_thunderclap'), first('hearth'), first('rockfall')];
  const out: readonly string[] = routeTo(first('hailfall'), 'stone_thunderclap').filter((id: string): boolean => !route.includes(id));
  const before: readonly string[] = [...route, ...out.slice(0, -1)];
  assert.equal(canAllocate(content, before, 3, first('hailfall')), false);
  assert.equal(canAllocate(content, before.filter((id: string): boolean => id !== first('rockfall')), 3, first('hailfall')), true);
});

void test('a save that somehow holds four specialties keeps the three taken first', (): void => {
  const kiln: readonly string[] = [...routeTo(first('kiln'), 'stone_thunderclap'), first('hearth'), first('rockfall')];
  const all: readonly string[] = [...kiln, ...routeTo(first('hailfall'), 'stone_thunderclap').filter((id: string): boolean => !kiln.includes(id))];
  assert.deepEqual(withinSpecialtyLimit(content, all), all.slice(0, -1));
  assert.equal(reachablePlaces(content, all).includes(first('hailfall')), false);
  assert.deepEqual(heldSpecialties(content, reachablePlaces(content, all)), ['kiln', 'hearth', 'rockfall']);
});

void test('a place cut off from the rest takes no specialty slot from a place that is held', (): void => {
  const three: readonly string[] = [...routeTo(first('kiln'), 'stone_thunderclap'), first('hearth')];
  const stray: string = first('hailfall');
  const rockfall: string = first('rockfall');
  assert.deepEqual(reachablePlaces(content, [stray, ...three, rockfall]), [...three, rockfall]);
});

void test('a skill learned in a fourth specialty is not taken back on load; its point is refunded', (): void => {
  const three: readonly string[] = [...routeTo(first('kiln'), 'stone_thunderclap'), first('hearth'), first('rockfall')];
  const out: readonly string[] = routeTo(first('hailfall'), 'stone_thunderclap').filter((id: string): boolean => !three.includes(id)).slice(0, -1);
  const held: readonly string[] = [...three, ...out];
  const taught: Content = { ...content, skillTree: content.skillTree.map((node: SkillTreeNodeDef): SkillTreeNodeDef => (node.id === first('hailfall') ? { ...node, unlock: 'taught_in_hail' } : node)) };
  assert.deepEqual(adoptLearned(taught, ['taught_in_hail'], held), { allocated: held, refund: 1 });
  assert.deepEqual(adoptLearned(taught, ['taught_in_hail'], held.filter((id: string): boolean => id !== first('rockfall'))).refund, 0);
});

void test('a hero at the top level fills well under half of the places their weapon reaches, yet can walk to any keystone of a specialty', (): void => {
  const top: number = earnedPoints(content, content.player.xp.maxLevel, content.chart.grants.map((grant): string => grant.id));
  for (const arm of ['stone', 'storm', 'blade', 'wind']) {
    const own: readonly SpecialtyDef[] = content.chart.specialties.filter((entry: SpecialtyDef): boolean => entry.path === arm);
    const reach: number = armPlaces(content, arm).length + own.reduce((total: number, entry: SpecialtyDef): number => total + specialtyPlaces(content, entry.id).length, 0);
    assert.ok(top * 2.5 < reach, `${arm}: ${top} points against ${reach} places`);
    const start: SkillTreeNodeDef | undefined = armPlaces(content, arm).find((node: SkillTreeNodeDef): boolean => node.requires.length === 0);
    assert.ok(start !== undefined, arm);
    for (const specialty of own) {
      for (const keystone of specialtyPlaces(content, specialty.id).filter((node: SkillTreeNodeDef): boolean => node.kind === 'keystone')) {
        const route: readonly string[] = routeTo(keystone.id, start.id);
        assert.equal(route[0], start.id, `${keystone.id} is reached from ${start.id}`);
        assert.ok(route.length <= top, `${keystone.id} lies within ${top} points of ${start.id}`);
      }
    }
  }
});
