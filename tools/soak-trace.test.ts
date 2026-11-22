import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import type { KeptThing } from './soak-trace.ts';
import { keptLines, madeLines, readKept, readMade, traceInstall, traceLap, traceMade, traceRead } from './soak-trace.ts';

class FakeGeometry {
  readonly type: string = 'BufferGeometry';
  readonly name: string = '';
  readonly uuid: string;
  readonly attributes: { readonly position: { readonly count: number } };
  constructor(uuid: string, count: number) {
    this.uuid = uuid;
    this.attributes = { position: { count } };
  }
  dispose(): string {
    return this.uuid;
  }
}

class FakeTexture {
  readonly isTexture: boolean = true;
  readonly uuid: string;
  readonly isRenderTargetTexture: boolean;
  constructor(uuid: string, isRenderTargetTexture: boolean = false) {
    this.uuid = uuid;
    this.isRenderTargetTexture = isRenderTargetTexture;
  }
  dispose(): string {
    return this.uuid;
  }
}

interface FakeMesh {
  readonly name: string;
  readonly type: string;
  readonly parent: FakeGroup;
  readonly geometry: FakeGeometry;
  readonly material: { readonly type: string; readonly name: string; readonly map: FakeTexture | null };
}

interface FakeGroup {
  readonly name: string;
  readonly type: string;
  readonly parent: null;
}

class FakeGl {
  made: number = 0;
  handle(): { readonly handle: number } {
    this.made += 1;
    return { handle: this.made };
  }
  createTexture(): { readonly handle: number } {
    return this.handle();
  }
  deleteTexture(handle: unknown): unknown {
    return handle;
  }
  createBuffer(): { readonly handle: number } {
    return this.handle();
  }
  deleteBuffer(handle: unknown): unknown {
    return handle;
  }
  createProgram(): { readonly handle: number } {
    return this.handle();
  }
  deleteProgram(handle: unknown): unknown {
    return handle;
  }
  bindTexture(target: number, handle: unknown): unknown {
    return [target, handle];
  }
  texImage2D(...args: readonly unknown[]): number {
    return args.length;
  }
}

interface Page {
  readonly window: { storm: { scene: { traverse(visit: (object: FakeMesh) => void): void }; world: { zone: { id: string } } } };
  readonly WebGL2RenderingContext: typeof FakeGl;
  requestAnimationFrame(frame: () => void): void;
}

interface Harness {
  readonly page: Page;
  readonly shown: FakeMesh[];
  zone(id: string): void;
  frames(count: number): void;
  run(expression: string): unknown;
}

const TEXTURE_2D: number = 3553;
const RGBA8: number = 6408;

const ROOT: FakeGroup = { name: 'falls', type: 'Group', parent: null };

function mesh(name: string, geometry: FakeGeometry, map: FakeTexture | null = null): FakeMesh {
  return { name, type: 'Mesh', parent: ROOT, geometry, material: { type: 'ShaderMaterial', name: 'fall', map } };
}

function harness(): Harness {
  const shown: FakeMesh[] = [];
  const queued: (() => void)[] = [];
  const world: { zone: { id: string } } = { zone: { id: 'start' } };
  const page: Page = {
    window: { storm: { scene: { traverse: (visit: (object: FakeMesh) => void): void => shown.forEach(visit) }, world } },
    WebGL2RenderingContext: class extends FakeGl {},
    requestAnimationFrame: (frame: () => void): void => void queued.push(frame),
  };
  return {
    page,
    shown,
    zone: (id: string): void => {
      world.zone.id = id;
    },
    frames: (count: number): void => {
      for (let at: number = 0; at < count; at += 1) queued.splice(0).forEach((frame: () => void): void => frame());
    },
    run: (expression: string): unknown => runInNewContext(expression, page),
  };
}

void test('the tracer names a thing rebuilt every lap and never freed, and skips what was freed or is still shown', (): void => {
  const page: Harness = harness();
  assert.equal(page.run(traceLap(1)), false);
  assert.equal(page.run(traceInstall(1)), true);
  const kept: FakeMesh = mesh('keep', new FakeGeometry('kept', 4));
  page.shown.push(kept);
  for (let lap: number = 1; lap <= 4; lap += 1) {
    assert.equal(page.run(traceLap(lap)), true);
    page.zone(`lava_${lap}`);
    const leaked: FakeMesh = mesh('fall', new FakeGeometry(`leak-${lap}`, 9), new FakeTexture(`map-${lap}`));
    const freed: FakeMesh = mesh('freed', new FakeGeometry(`freed-${lap}`, 3), new FakeTexture(`target-${lap}`, true));
    page.shown.push(leaked, freed);
    page.frames(2);
    page.shown.splice(page.shown.indexOf(leaked), 1);
    page.shown.splice(page.shown.indexOf(freed), 1);
    freed.geometry.dispose();
  }
  const found: KeptThing[] = readKept(page.run(traceRead(1, 3, 5)));
  assert.deepEqual(found, [
    { kind: 'geometry', what: 'BufferGeometry v9 @ fall < falls', laps: 3, count: 3, zones: ['lava_2', 'lava_3', 'lava_4'] },
    { kind: 'texture', what: 'map on fall @ fall < falls', laps: 3, count: 3, zones: ['lava_2', 'lava_3', 'lava_4'] },
  ]);
  assert.deepEqual(keptLines(found), ['kept after leaving: 3 geometries over 3 laps, BufferGeometry v9 @ fall < falls (lava_2, lava_3, lava_4)', 'kept after leaving: 3 textures over 3 laps, map on fall @ fall < falls (lava_2, lava_3, lava_4)']);
});

void test('a page without the tracer reads as nothing kept, and a bad reading is refused', (): void => {
  assert.deepEqual(readKept(harness().run(traceRead())), []);
  assert.throws((): KeptThing[] => readKept([{ kind: 'geometry', what: 'x', laps: 'three', count: 1, zones: [] }]));
});

void test('the tracer also names GPU textures, buffers and programs made every lap and never deleted', (): void => {
  const page: Harness = harness();
  assert.equal(page.run(traceInstall(1)), true);
  const gl: FakeGl = new page.page.WebGL2RenderingContext();
  for (let lap: number = 1; lap <= 4; lap += 1) {
    page.run(traceLap(lap));
    page.zone(`hall_${lap}`);
    gl.bindTexture(TEXTURE_2D, gl.createTexture());
    gl.texImage2D(TEXTURE_2D, 0, RGBA8, 4, 2, 0, RGBA8, 0, null);
    gl.deleteBuffer(gl.createBuffer());
    if (lap % 2 === 0) gl.createProgram();
  }
  const found: KeptThing[] = readKept(page.run(traceRead(1, 3, 5)));
  assert.deepEqual(
    found.map((thing: KeptThing): readonly [string, number, number, readonly string[]] => [thing.kind, thing.laps, thing.count, thing.zones]),
    [['gl texture', 3, 3, ['hall_2', 'hall_3', 'hall_4']]],
  );
  assert.deepEqual(keptLines(found), ['kept after leaving: 3 GPU textures over 3 laps, 4x2 format 6408 (hall_2, hall_3, hall_4)']);
  assert.deepEqual(madeLines(readMade(page.run(traceMade()))), ['GPU textures made per lap: 1, 1, 1, 1', 'GPU buffers made per lap: 1, 1, 1, 1', 'shader programs made per lap: 0, 1, 0, 1']);
});
