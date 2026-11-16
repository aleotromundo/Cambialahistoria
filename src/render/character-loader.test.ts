import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnimationClip, Bone, BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { Object3D } from 'three';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { AttachmentDef, Content, RigDef } from '../../sim/content/types.ts';
import type { CharacterLibrary, LoadedRig, RigClipSet, RigInstance } from './character-loader.ts';
import { CHARACTER_SHADE, instantiateRig } from './character-loader.ts';

const content: Content = loadContent();
const rigDef: RigDef = must(content.rigs.get(content.player.hero.rig), 'player rig');
const visual: string = must(must(content.itemBases.get('rusted_blade'), 'rusted_blade').visual, 'blade visual');
const bladeDef: AttachmentDef = must(content.attachments.get(visual), 'blade attachment');
const FRAME: number = 1 / 60;

const clips: RigClipSet = {
  idle: new AnimationClip('idle', 1, []),
  run: new AnimationClip('run', 1, []),
  gaits: [],
  hit: [],
  death: [],
  rise: null,
  actions: new Map(),
  unarmed: { idle: new AnimationClip('bare_idle', 1, []), actions: new Map() },
  stances: new Map(),
};

function bladeRig(): { readonly rig: RigInstance; readonly hand: Object3D } {
  const template: Group = new Group();
  const hand: Bone = new Bone();
  hand.name = must(rigDef.sockets[bladeDef.socket], 'socket').bone;
  template.add(hand);
  const bladeTemplate: Group = new Group();
  bladeTemplate.add(new Mesh(new BufferGeometry(), new MeshStandardMaterial()));
  const loaded: LoadedRig = { def: rigDef, template, clips, bodyParts: [], bodyMasks: new Map(), fitted: new Map() };
  const library: CharacterLibrary = { rigs: new Map([[rigDef.id, loaded]]), attachments: new Map([[visual, { def: bladeDef, template: bladeTemplate }]]), wearables: new Map() };
  const rig: RigInstance = instantiateRig(loaded, library, { tint: '#ffffff', glow: '#ffffff', ghost: null, feather: false });
  rig.setGear([visual]);
  return { rig, hand: must(rig.root.getObjectByName(hand.name), 'hand') };
}

function heldMaterial(hand: Object3D): MeshStandardMaterial {
  const found: MeshStandardMaterial[] = [];
  hand.traverse((node: Object3D): void => {
    if (node instanceof Mesh && node.material instanceof MeshStandardMaterial) found.push(node.material);
  });
  return must(found[0], 'held material');
}

function scaleOf(holder: Object3D): number {
  return holder.scale.x;
}

function settle(rig: RigInstance): void {
  for (let frame: number = 0; frame < 240; frame += 1) rig.stepWear(FRAME);
}

void test('a character\'s shading never takes pow of an unclamped facing term', (): void => {
  assert.deepEqual(unsafeGlsl(CHARACTER_SHADE), []);
});

void test('the hover glow lights only a character\'s edge, so a hovered person keeps their shading instead of turning into a flat cut-out', (): void => {
  assert.match(CHARACTER_SHADE, /uHover \* pow\( edgeFacing,/);
  assert.doesNotMatch(CHARACTER_SHADE, /uHover \+|\+ uHover;|uHover\s*;/);
});

void test('a hit flash lights a character mostly at the edge, so a struck figure keeps its shading instead of filling flat white', (): void => {
  assert.match(CHARACTER_SHADE, /uFlash \* \( 0\.15 \+ 0\.85 \* pow\( edgeFacing,.*\+ diffuseColor\.rgb \* uFlashLift/);
});

void test('a weapon put away shrinks out and leaves the hand, and one taken up grows in and then holds still', (): void => {
  const { rig, hand } = bladeRig();
  const size: number = must(rigDef.sockets[bladeDef.socket], 'socket').scale;
  const first: Object3D = must(hand.children[0], 'first holder');
  assert.equal(scaleOf(first), size);
  rig.setGear([]);
  rig.stepWear(FRAME);
  assert.ok(scaleOf(first) < size);
  assert.equal(first.parent, hand);
  settle(rig);
  assert.equal(first.parent, null);
  rig.setGear([visual]);
  const second: Object3D = must(hand.children[0], 'second holder');
  assert.equal(scaleOf(second), 0);
  rig.stepWear(FRAME);
  assert.ok(scaleOf(second) > 0);
  settle(rig);
  assert.equal(scaleOf(second), size);
  rig.setGear([visual]);
  rig.stepWear(FRAME);
  assert.equal(scaleOf(second), size);
  assert.equal(hand.children.length, 1);
});

void test('fading a body reaches a weapon taken up after the last fade, and no longer reaches one it has let go', (): void => {
  const { rig, hand } = bladeRig();
  const first: MeshStandardMaterial = heldMaterial(hand);
  rig.setFade(0.5);
  assert.equal(first.opacity, 0.5);
  rig.setGear([]);
  settle(rig);
  rig.setGear([visual]);
  const second: MeshStandardMaterial = heldMaterial(hand);
  rig.setFade(0.25);
  assert.equal(second.opacity, 0.25);
  assert.equal(first.opacity, 0.5);
});
