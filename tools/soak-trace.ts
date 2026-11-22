import { each, fields, numeric, text, textList } from '../sim/content/read.ts';
import type { Fields } from '../sim/content/read.ts';

export const SOAK_TRACE = {
  everyFrames: 10,
  pathDepth: 5,
  warmLaps: 1,
  leastLaps: 3,
  shown: 12,
  indexTarget: 34963,
} as const;

const KIND_LABELS: Readonly<Record<string, string>> = {
  texture: 'textures',
  geometry: 'geometries',
  'gl texture': 'GPU textures',
  'gl buffer': 'GPU buffers',
  'gl program': 'shader programs',
};

export interface KeptThing {
  readonly kind: string;
  readonly what: string;
  readonly laps: number;
  readonly count: number;
  readonly zones: readonly string[];
}

export function traceInstall(everyFrames: number = SOAK_TRACE.everyFrames, depth: number = SOAK_TRACE.pathDepth): string {
  return `(() => {
  const s = window.storm;
  const T = (window.__soakTrace = { lap: 0, frame: 0, seen: new Map(), disposed: new Set(), patched: new Set(), handles: new Map(), made: {}, boundTexture: null, boundBuffers: new Map() });
  const gl = typeof WebGL2RenderingContext === 'undefined' ? null : WebGL2RenderingContext.prototype;
  const sized = (handle, what) => { const entry = handle ? T.handles.get(handle) : undefined; if (entry !== undefined && entry.what === 'unsized') entry.what = what; };
  const wrap = (name, before) => { const original = gl[name]; if (typeof original !== 'function') return; gl[name] = function (...args) { before(args); return original.apply(this, args); }; };
  if (gl !== null) {
    for (const [make, drop, kind] of [['createTexture', 'deleteTexture', 'gl texture'], ['createBuffer', 'deleteBuffer', 'gl buffer'], ['createProgram', 'deleteProgram', 'gl program']]) {
      const made = gl[make];
      gl[make] = function (...args) {
        const handle = made.apply(this, args);
        if (handle) {
          T.handles.set(handle, { kind, what: 'unsized', zone: s.world.zone.id, lap: T.lap });
          const counts = (T.made[kind] = T.made[kind] || []);
          counts[T.lap] = (counts[T.lap] || 0) + 1;
        }
        return handle;
      };
      wrap(drop, (args) => T.handles.delete(args[0]));
    }
    wrap('bindTexture', (args) => { T.boundTexture = args[1]; });
    wrap('bindBuffer', (args) => { T.boundBuffers.set(args[0], args[1]); });
    wrap('texStorage2D', (args) => sized(T.boundTexture, args[3] + 'x' + args[4] + ' format ' + args[2] + ' levels ' + args[1]));
    wrap('texStorage3D', (args) => sized(T.boundTexture, args[3] + 'x' + args[4] + 'x' + args[5] + ' format ' + args[2]));
    wrap('texImage2D', (args) => { if (args[1] !== 0) return; const source = args.length === 6 ? args[5] : null; sized(T.boundTexture, (source ? source.width : args[3]) + 'x' + (source ? source.height : args[4]) + ' format ' + args[2]); });
    wrap('texImage3D', (args) => { if (args[1] === 0) sized(T.boundTexture, args[3] + 'x' + args[4] + 'x' + args[5] + ' format ' + args[2]); });
    wrap('bufferData', (args) => sized(T.boundBuffers.get(args[0]), (args[0] === ${SOAK_TRACE.indexTarget} ? 'index ' : 'vertex ') + (typeof args[1] === 'number' ? args[1] : args[1] ? args[1].byteLength : 0) + ' bytes'));
  }
  const owner = (value) => { let p = Object.getPrototypeOf(value); while (p && !Object.prototype.hasOwnProperty.call(p, 'dispose')) p = Object.getPrototypeOf(p); return p; };
  const patch = (value) => { const p = owner(value); if (!p || T.patched.has(p)) return; T.patched.add(p); const before = p.dispose; p.dispose = function () { T.disposed.add(this.uuid); return before.call(this); }; };
  const path = (o) => { const names = []; for (let c = o, i = 0; c && i < ${depth}; c = c.parent, i += 1) names.push(c.name || c.type); return names.join(' < '); };
  const note = (value, kind, what) => { patch(value); if (!T.seen.has(value.uuid)) T.seen.set(value.uuid, { kind, what, zone: s.world.zone.id, lap: T.lap }); };
  const texture = (value, what) => { if (value && value.isTexture && !value.isRenderTargetTexture) note(value, 'texture', what); };
  const look = (o) => {
    const g = o.geometry;
    if (g && g.uuid) note(g, 'geometry', (g.name || g.type) + ' v' + (g.attributes && g.attributes.position ? g.attributes.position.count : 0) + ' @ ' + path(o));
    for (const m of [].concat(o.material || [])) {
      if (!m) continue;
      const on = ' on ' + (m.name || m.type) + ' @ ' + path(o);
      for (const [key, value] of Object.entries(m)) texture(value, key + on);
      if (m.uniforms) for (const [key, uniform] of Object.entries(m.uniforms)) texture(uniform && uniform.value, key + on);
    }
  };
  const sweep = () => { T.frame += 1; if (T.frame % ${everyFrames} === 0) s.scene.traverse(look); requestAnimationFrame(sweep); };
  requestAnimationFrame(sweep);
  return true;
})()`;
}

export function traceLap(lap: number): string {
  return `(window.__soakTrace === undefined ? false : ((window.__soakTrace.lap = ${lap}), true))`;
}

export function traceRead(warmLaps: number = SOAK_TRACE.warmLaps, leastLaps: number = SOAK_TRACE.leastLaps, shown: number = SOAK_TRACE.shown): string {
  return `(() => {
  const T = window.__soakTrace;
  if (T === undefined) return [];
  const now = new Set();
  window.storm.scene.traverse((o) => {
    if (o.geometry) now.add(o.geometry.uuid);
    for (const m of [].concat(o.material || [])) {
      if (!m) continue;
      for (const value of Object.values(m)) if (value && value.isTexture) now.add(value.uuid);
      if (m.uniforms) for (const uniform of Object.values(m.uniforms)) if (uniform && uniform.value && uniform.value.isTexture) now.add(uniform.value.uuid);
    }
  });
  const groups = new Map();
  const live = [...T.seen].filter(([id]) => !now.has(id) && !T.disposed.has(id)).map(([, entry]) => entry).concat([...T.handles.values()]);
  for (const entry of live) {
    if (entry.lap <= ${warmLaps}) continue;
    const key = entry.kind + '|' + entry.what;
    const group = groups.get(key) || { kind: entry.kind, what: entry.what, laps: new Set(), count: 0, zones: new Set() };
    group.laps.add(entry.lap);
    group.count += 1;
    group.zones.add(entry.zone);
    groups.set(key, group);
  }
  return [...groups.values()].filter((group) => group.laps.size >= ${leastLaps}).sort((a, b) => b.count - a.count).slice(0, ${shown}).map((group) => ({ kind: group.kind, what: group.what, laps: group.laps.size, count: group.count, zones: [...group.zones].sort() }));
})()`;
}

export interface MadeCount {
  readonly kind: string;
  readonly perLap: readonly number[];
}

export function traceMade(): string {
  return `(window.__soakTrace === undefined ? [] : Object.entries(window.__soakTrace.made).map(([kind, counts]) => ({ kind, perLap: Array.from({ length: window.__soakTrace.lap }, (_, at) => counts[at + 1] || 0) })))`;
}

export function readMade(value: unknown): MadeCount[] {
  return [...each(value, 'made', (entry: unknown, where: string): MadeCount => {
    const read: Fields = fields(entry, where);
    return { kind: text(read, 'kind', where), perLap: [...each(read['perLap'], `${where}.perLap`, (count: unknown, at: string): number => numeric({ count }, 'count', at))] };
  })];
}

export function madeLines(made: readonly MadeCount[]): string[] {
  return made.map((count: MadeCount): string => `${KIND_LABELS[count.kind] ?? count.kind} made per lap: ${count.perLap.join(', ')}`);
}

export function readKept(value: unknown): KeptThing[] {
  return [...each(value, 'kept', (entry: unknown, where: string): KeptThing => {
    const read: Fields = fields(entry, where);
    return { kind: text(read, 'kind', where), what: text(read, 'what', where), laps: numeric(read, 'laps', where), count: numeric(read, 'count', where), zones: [...textList(read, 'zones', where)] };
  })];
}

export function keptLines(kept: readonly KeptThing[]): string[] {
  return kept.map((thing: KeptThing): string => `kept after leaving: ${thing.count} ${KIND_LABELS[thing.kind] ?? thing.kind} over ${thing.laps} laps, ${thing.what} (${thing.zones.join(', ')})`);
}
