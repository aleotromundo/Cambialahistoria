import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnimationClip, Group } from 'three';
import type { ActionClip } from './character-library.ts';
import type { LoadedClipFile, PrivateClipDeps, PrivateClips, PrivateClipSource } from './private-clips.ts';
import { addPrivateActions, loadPrivateClips } from './private-clips.ts';

const BASE: string = 'https://assets.example/storm/';

function fileWith(name: string): LoadedClipFile {
  return { animations: [new AnimationClip(name, 1, [])], scene: new Group() };
}

function sourceNamed(name: string): PrivateClipSource {
  return { clip: new AnimationClip(name, 2, []), scene: new Group() };
}

function depsFor(manifest: unknown, files: ReadonlyMap<string, LoadedClipFile>, asked: string[]): PrivateClipDeps {
  return {
    base: BASE,
    fetchJson: (url: string): Promise<unknown> => {
      asked.push(url);
      return manifest instanceof Error ? Promise.reject(manifest) : Promise.resolve(manifest);
    },
    loadFile: (url: string): Promise<LoadedClipFile> => {
      asked.push(url);
      const file: LoadedClipFile | undefined = files.get(url);
      return file === undefined ? Promise.reject(new Error('404')) : Promise.resolve(file);
    },
  };
}

void test('with no asset base nothing is fetched and there are no private clips', async (): Promise<void> => {
  const asked: string[] = [];
  const clips: PrivateClips = await loadPrivateClips({ ...depsFor({ sfx: {} }, new Map(), asked), base: null });
  assert.equal(clips.size, 0);
  assert.deepEqual(asked, []);
});

void test('a missing or broken manifest leaves the game with no private clips and no error', async (): Promise<void> => {
  const loaded: PrivateClips[] = await Promise.all([new Error('offline'), null, { voice: {} }, { sfx: {} }].map((manifest: unknown): Promise<PrivateClips> => loadPrivateClips(depsFor(manifest, new Map(), []))));
  assert.deepEqual(loaded.map((clips: PrivateClips): number => clips.size), [0, 0, 0, 0]);
});

void test('each clip the manifest names is loaded from under the base, and one that fails or escapes the base is skipped', async (): Promise<void> => {
  const asked: string[] = [];
  const files: Map<string, LoadedClipFile> = new Map([
    [`${BASE}anim/millwheel/in.glb`, fileWith('In')],
    [`${BASE}anim/millwheel/empty.glb`, { animations: [], scene: new Group() }],
  ]);
  const manifest: unknown = { sfx: {}, clips: { spin_whirlwind_in: 'anim/millwheel/in.glb', spin_whirlwind_loop: 'anim/millwheel/missing.glb', spin_whirlwind_out: '../out.glb', spin_empty: 'anim/millwheel/empty.glb' } };
  const clips: PrivateClips = await loadPrivateClips(depsFor(manifest, files, asked));
  assert.deepEqual([...clips.keys()], ['spin_whirlwind_in']);
  assert.equal(clips.get('spin_whirlwind_in')?.clip.name, 'In');
  assert.ok(asked.every((url: string): boolean => url.startsWith(BASE)));
});

void test('private clips join a rig as actions and never replace one its data names', (): void => {
  const authored: ActionClip = { clip: new AnimationClip('Sword_Attack', 1, []), impactTime: 0.4 };
  const actions: Map<string, ActionClip> = new Map([['attack', authored]]);
  addPrivateActions(actions, new Map([['attack', sourceNamed('Other')], ['spin_whirlwind_loop', sourceNamed('Loop')]]), (from: PrivateClipSource): AnimationClip => from.clip);
  assert.equal(actions.get('attack'), authored);
  assert.equal(actions.get('spin_whirlwind_loop')?.clip.name, 'Loop');
  assert.equal(actions.get('spin_whirlwind_loop')?.impactTime, 0);
});
