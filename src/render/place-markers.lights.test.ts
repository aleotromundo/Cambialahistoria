import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Object3D, Vector3 } from 'three';
import { Group, Light, PointLight } from 'three';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Place } from '../../sim/content/markers.ts';
import { placeKey, zonePlaces } from '../../sim/content/markers.ts';
import type { Content } from '../../sim/content/types.ts';
import type { World } from '../../sim/world/types.ts';
import type { MarkerView } from './place-markers.ts';
import { lightPlaces, PLACE_MARKERS, placeLightSlots, placeState, placeView, showPlace } from './place-markers.ts';

const content: Content = loadContent();

function lightsDrawn(group: Group): number {
  let count: number = 0;
  group.traverseVisible((object: Object3D): void => {
    if (object instanceof Light) count += 1;
  });
  return count;
}

function hiddenWayUnder(world: World): Place {
  return must(zonePlaces(content, world.zone).find((place: Place): boolean => placeKey(place.ref) === 'exit:under'), 'the way under');
}

function litAt(x: number, z: number, intensity: number): MarkerView {
  const world: World = worldIn(content, 'keepers_gate', 1);
  const place: Place = { ...hiddenWayUnder(world), x, z };
  const view: MarkerView = placeView(place, placeState(world, place.ref), new Group());
  view.light.position.set(x, 1, z);
  view.light.distance = 4;
  view.light.intensity = intensity;
  return view;
}

function slotsOf(count: number): PointLight[] {
  return Array.from({ length: count }, (): PointLight => new PointLight(0xffffff, 0, 1));
}

void test('every zone puts the same number of place lights in the scene, so the shaders built in one zone are the ones every other zone draws with', (): void => {
  const counts: Set<number> = new Set<number>();
  for (const zone of content.zones.values()) {
    const group: Group = new Group();
    placeLightSlots(group, true);
    const world: World = worldIn(content, zone.id, 1);
    for (const place of zonePlaces(content, world.zone)) placeView(place, placeState(world, place.ref), group);
    counts.add(lightsDrawn(group));
  }
  assert.deepEqual([...counts], [PLACE_MARKERS.lightSlots]);
});

void test('hiding or showing a place never changes the light count the shaders were built for', (): void => {
  const world: World = worldIn(content, 'keepers_gate', 1);
  const place: Place = hiddenWayUnder(world);
  assert.equal(placeState(world, place.ref).shown, false);
  const group: Group = new Group();
  placeLightSlots(group, true);
  const view: MarkerView = placeView(place, placeState(world, place.ref), group);
  const built: number = lightsDrawn(group);
  showPlace(view, 0);
  assert.equal(view.root.visible, false);
  assert.equal(lightsDrawn(group), built);
  showPlace(view, 1);
  assert.equal(view.root.visible, true);
  assert.equal(lightsDrawn(group), built);
});

void test('the light of a place rises and sinks with it and stands over it', (): void => {
  const world: World = worldIn(content, 'keepers_gate', 1);
  const place: Place = hiddenWayUnder(world);
  const view: MarkerView = placeView(place, placeState(world, place.ref), new Group());
  for (const shown of [0, 0.5, 1]) {
    showPlace(view, shown);
    const over: Vector3 = view.root.position.clone().setY(view.root.position.y + place.kind.light.height);
    assert.ok(view.light.position.distanceTo(over) < 1e-9);
  }
});

void test('a tier with no marker lights puts no place light in the scene', (): void => {
  const group: Group = new Group();
  assert.equal(placeLightSlots(group, false).length, 0);
  assert.equal(lightsDrawn(group), 0);
});

void test('the nearest lit places take the light slots and the farther ones stay dark', (): void => {
  const slots: PointLight[] = slotsOf(2);
  const near: MarkerView = litAt(1, 0, 5);
  const middle: MarkerView = litAt(30, 0, 3);
  const far: MarkerView = litAt(60, 0, 2);
  lightPlaces(slots, [far, near, middle], 0, 0);
  const lit: number[] = slots.map((slot: PointLight): number => slot.position.x);
  assert.deepEqual(lit, [1, 30]);
  assert.equal(slots[0]?.intensity, 5);
  assert.equal(slots[1]?.intensity, 3);
});

void test('a place whose light is out takes no slot', (): void => {
  const slots: PointLight[] = slotsOf(1);
  lightPlaces(slots, [litAt(1, 0, 0), litAt(40, 0, 2)], 0, 0);
  const slot: PointLight = must(slots[0], 'the slot');
  assert.equal(slot.position.x, 40);
  assert.equal(slot.intensity, 2);
});

void test('a slot fades its place out as the place nears the edge of the lit set, so a place never pops dark', (): void => {
  const slots: PointLight[] = slotsOf(1);
  lightPlaces(slots, [litAt(10, 0, 4), litAt(12, 0, 4)], 0, 0);
  const fading: number = slots[0]?.intensity ?? 0;
  assert.ok(fading > 0 && fading < 4);
  lightPlaces(slots, [litAt(10, 0, 4), litAt(10 + PLACE_MARKERS.lightFadeBand + 1, 0, 4)], 0, 0);
  assert.equal(slots[0]?.intensity, 4);
});

void test('slots with no place to light stay dark', (): void => {
  const slots: PointLight[] = slotsOf(3);
  for (const slot of slots) slot.intensity = 9;
  lightPlaces(slots, [litAt(1, 0, 5)], 0, 0);
  assert.deepEqual(
    slots.map((slot: PointLight): number => slot.intensity),
    [5, 0, 0],
  );
});
