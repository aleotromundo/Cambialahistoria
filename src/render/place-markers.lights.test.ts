import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Object3D, Vector3 } from 'three';
import { Group, Light } from 'three';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Place } from '../../sim/content/markers.ts';
import { placeKey, zonePlaces } from '../../sim/content/markers.ts';
import type { Content } from '../../sim/content/types.ts';
import type { World } from '../../sim/world/types.ts';
import type { MarkerView } from './place-markers.ts';
import { placeState, placeView, showPlace } from './place-markers.ts';

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

void test('a way hidden until the keeper falls keeps its light in the scene, so hiding or showing it never changes the light count the shaders were built for', (): void => {
  const world: World = worldIn(content, 'keepers_gate', 1);
  const place: Place = hiddenWayUnder(world);
  assert.equal(placeState(world, place.ref).shown, false);
  const group: Group = new Group();
  const view: MarkerView = placeView(place, placeState(world, place.ref), group, true);
  const built: number = lightsDrawn(group);
  assert.equal(built, 1);
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
  const view: MarkerView = placeView(place, placeState(world, place.ref), new Group(), true);
  for (const shown of [0, 0.5, 1]) {
    showPlace(view, shown);
    const over: Vector3 = view.root.position.clone().setY(view.root.position.y + place.kind.light.height);
    assert.ok(view.light.position.distanceTo(over) < 1e-9);
  }
});

void test('a place on a tier with no marker lights adds no light at all', (): void => {
  const world: World = worldIn(content, 'keepers_gate', 1);
  const group: Group = new Group();
  placeView(hiddenWayUnder(world), placeState(world, { type: 'exit', exit: 'under' }), group, false);
  assert.equal(lightsDrawn(group), 0);
});
