import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Camera, Material, Object3D, Scene as SceneType } from 'three';
import { AnimationClip, BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadContent } from '../../sim/content/content.ts';
import { createWorld } from '../../sim/world/create.ts';
import type { World } from '../../sim/world/types.ts';
import type { MomentDef, MomentEcho } from '../../sim/content/moment-types.ts';
import type { Content, MonsterDef, RigDef } from '../../sim/content/types.ts';
import { wearKey, wornWearables } from '../../sim/wear.ts';
import { settle } from '../../test/backend-support.ts';
import { must } from '../../test/support.ts';
import { QUALITY_TIERS } from '../mobile/quality.ts';
import type { CharacterLibrary, LoadedRig, LoadedWearable, RigClipSet } from './character-loader.ts';
import type { MomentView } from './moment-view.ts';
import type { MomentCompiler } from './moment-warm.ts';
import { createMomentView } from './moment-view.ts';
import type { FramePacer } from './paced-work.ts';
import type { ParticleSystem } from './particles.ts';

const loaded: Content = loadContent();

const content: Content = {
  ...loaded,
  props: new Map(),
  surfaces: new Map(),
  moments: { ...loaded.moments, defs: new Map([...loaded.moments.defs].map(([id, def]: [string, MomentDef]): [string, MomentDef] => [id, { ...def, props: [] }])) },
};

const PACER: FramePacer = { now: (): number => 0, next: (): Promise<void> => Promise.resolve() };

const PARTICLES: ParticleSystem = { burst: (): void => undefined, setDensity: (): void => undefined, update: (): void => undefined, clear: (): void => undefined };

const RIG_NAME: string = 'warm-rig:';

interface Compiled {
  readonly meshes: readonly Object3D[];
}

interface FakeCompiler extends MomentCompiler {
  readonly compiled: Compiled[];
  readonly uploads: Texture[];
}

function fakeCompiler(): FakeCompiler {
  const compiled: Compiled[] = [];
  const uploads: Texture[] = [];
  return {
    compiled,
    uploads,
    compileAsync(target: Object3D, _viewer: Camera, _lit: SceneType): Promise<unknown> {
      const meshes: Object3D[] = [];
      target.traverse((object: Object3D): void => {
        if (object.type === 'Mesh') meshes.push(object);
      });
      compiled.push({ meshes });
      return Promise.resolve(target);
    },
    initTexture(texture: Texture): void {
      uploads.push(texture);
    },
  };
}

function monsterOf(id: string): MonsterDef {
  return must(content.monsters.get(id), id);
}

function fakeRig(def: RigDef, texture: Texture): LoadedRig {
  const template: Group = new Group();
  template.name = `${RIG_NAME}${def.id}`;
  template.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ map: texture })));
  const idle: AnimationClip = new AnimationClip('idle', 1, []);
  const clips: RigClipSet = { idle, run: new AnimationClip('run', 1, []), gaits: [], hit: [], death: [], rise: null, actions: new Map(), unarmed: null, stances: new Map() };
  return { def, template, clips, bodyParts: [], bodyMasks: new Map(), fitted: new Map() };
}

function echoRig(echo: MomentEcho): string {
  return echo.look?.rig ?? monsterOf(echo.monster).rig;
}

function makeReady(library: CharacterLibrary, rigId: string, texture: Texture): void {
  const def: RigDef = must(content.rigs.get(rigId), rigId);
  library.rigs.set(def.id, fakeRig(def, texture));
  for (const moment of content.moments.defs.values()) {
    for (const echo of moment.echoes) {
      if (echoRig(echo) !== rigId) continue;
      const monster: MonsterDef = monsterOf(echo.monster);
      for (const id of wornWearables(content, rigId, echo.look?.wear ?? monster.wear, null)) {
        library.wearables.set(wearKey(def.frame, id), { def: must(content.wearables.get(id), id), frame: def.frame, model: '', pieces: [], drawn: [], iconWith: [] });
      }
      for (const id of echo.look?.gear ?? monster.gear) library.attachments.set(id, { def: must(content.attachments.get(id), id), template: new Group() });
    }
  }
}

function rigRootsOf(view: MomentView, scene: Scene): Object3D[] {
  const hide: () => void = view.showWarm(0, 0);
  const roots: Object3D[] = [];
  scene.traverse((object: Object3D): void => {
    if (object.name.startsWith(RIG_NAME)) roots.push(object);
  });
  hide();
  return roots;
}

function echoesOf(rigId: string): number {
  let count: number = 0;
  for (const def of content.moments.defs.values()) for (const echo of def.echoes) if (echoRig(echo) === rigId) count += 1;
  return count;
}

function underAny(object: Object3D, roots: ReadonlySet<Object3D>): boolean {
  for (let at: Object3D | null = object; at !== null; at = at.parent) if (roots.has(at)) return true;
  return false;
}

function momentView(library: CharacterLibrary, scene: Scene): MomentView {
  return createMomentView({ scene, loader: new GLTFLoader(), content, library, dresser: (_dress: Readonly<Record<string, string>>, material: Material): Material => material, tier: QUALITY_TIERS.desktop, particles: PARTICLES, flash: (): void => undefined, trauma: (): void => undefined }, PACER);
}

void test('a moment rig that arrives later is warmed on its own, and the moments warmed before are kept rather than rebuilt', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const camera: PerspectiveCamera = new PerspectiveCamera();
  const library: CharacterLibrary = { rigs: new Map(), attachments: new Map(), wearables: new Map() };
  const first: Texture = new Texture();
  const later: Texture = new Texture();
  const firstRig: string = 'human_elder';
  const laterRig: string = 'human_woman';
  makeReady(library, firstRig, first);
  const view: MomentView = momentView(library, scene);
  const compiler: FakeCompiler = fakeCompiler();

  await view.prepare(compiler, camera);
  const before: readonly Object3D[] = rigRootsOf(view, scene);
  assert.equal(before.length, echoesOf(firstRig));
  assert.ok(before.length > 0);

  makeReady(library, laterRig, later);
  await view.prepare(compiler, camera);
  const after: readonly Object3D[] = rigRootsOf(view, scene);
  const added: Set<Object3D> = new Set<Object3D>(after.filter((root: Object3D): boolean => !before.includes(root)));

  assert.ok(before.every((root: Object3D): boolean => after.includes(root)), 'a figure warmed before was rebuilt');
  assert.equal(added.size, echoesOf(laterRig));
  assert.ok([...added].every((root: Object3D): boolean => root.name === `${RIG_NAME}${laterRig}`));
  const second: Compiled = must(compiler.compiled[1], 'second compile');
  assert.equal(compiler.compiled.length, 2);
  assert.ok(second.meshes.length > 0);
  assert.ok(second.meshes.every((mesh: Object3D): boolean => underAny(mesh, added)), 'the second warm compiled more than the new figures');
  assert.equal(compiler.uploads.filter((texture: Texture): boolean => texture === first).length, 1);
  assert.equal(compiler.uploads.filter((texture: Texture): boolean => texture === later).length, 1);
});

void test('warming again with no new moment rig ready compiles and uploads nothing', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const camera: PerspectiveCamera = new PerspectiveCamera();
  const library: CharacterLibrary = { rigs: new Map(), attachments: new Map(), wearables: new Map() };
  makeReady(library, 'human_elder', new Texture());
  const view: MomentView = momentView(library, scene);
  const compiler: FakeCompiler = fakeCompiler();

  await view.prepare(compiler, camera);
  const uploads: number = compiler.uploads.length;
  const roots: readonly Object3D[] = rigRootsOf(view, scene);
  await view.prepare(compiler, camera);

  assert.equal(compiler.compiled.length, 1);
  assert.equal(compiler.uploads.length, uploads);
  assert.deepEqual(rigRootsOf(view, scene), roots);
});

void test('a moment figure whose clothes finish loading after its rig is warmed once they arrive', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const camera: PerspectiveCamera = new PerspectiveCamera();
  const library: CharacterLibrary = { rigs: new Map(), attachments: new Map(), wearables: new Map() };
  const rigId: string = 'human_elder';
  makeReady(library, rigId, new Texture());
  const clothes: ReadonlyMap<string, LoadedWearable> = new Map<string, LoadedWearable>(library.wearables);
  library.wearables.clear();
  const view: MomentView = momentView(library, scene);
  const compiler: FakeCompiler = fakeCompiler();
  const world: World = createWorld(content, { seed: 2, save: null, opening: true });

  await view.warm(compiler, camera);
  assert.equal(rigRootsOf(view, scene).length, 0);

  for (const [key, worn] of clothes) library.wearables.set(key, worn);
  view.update(0, world);
  await settle();

  assert.equal(rigRootsOf(view, scene).length, echoesOf(rigId));
  assert.equal(compiler.compiled.length, 2);
});
