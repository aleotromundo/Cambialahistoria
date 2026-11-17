import type { Object3D } from 'three';
import { Color } from 'three';
import type { RankLook } from '../../sim/content/rank-types.ts';
import type { MonsterState, World } from '../../sim/world/types.ts';
import type { GroundLight } from './ground-light.ts';
import { createGroundLight } from './ground-light.ts';
import type { ShadeMotion } from './shadow-shade.ts';
import { stepShade } from './shadow-shade.ts';
import { floorUp } from './terrain-lift.ts';

export const RANK_LOOK = {
  fill: 0.9,
  width: 0.9,
  wobble: 0.4,
  height: 0.05,
  minRadius: 0.9,
  gone: 0.004,
} as const;

export interface RankGlow {
  readonly color: Color;
  readonly amount: number;
}

interface Lit {
  readonly color: Color;
  readonly look: RankLook;
  readonly light: GroundLight;
  readonly body: ShadeMotion;
  monster: MonsterState;
}

export interface RankLookView {
  update(dt: number, world: World): void;
  bodyGlow(monsterId: number): RankGlow | null;
}

export function rankLookOf(monster: MonsterState): RankLook | null {
  return monster.def.rank?.look ?? null;
}

export function rankLightRadius(monster: MonsterState, look: RankLook): number {
  return Math.max(RANK_LOOK.minRadius, monster.radius * look.reach);
}

export function rankShown(monster: MonsterState): boolean {
  return monster.alive;
}

export function createRankLook(parent: Object3D): RankLookView {
  const lit: Map<number, Lit> = new Map<number, Lit>();
  let clock: number = 0;
  const drop = (id: number, entry: Lit): void => {
    entry.light.dispose();
    lit.delete(id);
  };
  return {
    update(dt: number, world: World): void {
      clock += dt;
      const here: Map<number, MonsterState> = new Map<number, MonsterState>();
      for (const monster of world.monsters) {
        here.set(monster.id, monster);
        const look: RankLook | null = rankLookOf(monster);
        const aura: string | null = monster.def.rank?.aura ?? null;
        if (look === null || aura === null || !monster.alive || lit.has(monster.id)) continue;
        const color: Color = new Color(aura);
        const light: GroundLight = createGroundLight(color, { kind: 'round', radius: rankLightRadius(monster, look), inner: 0, arc: Math.PI * 2 }, { fill: RANK_LOOK.fill, band: 0, width: RANK_LOOK.width, wobble: RANK_LOOK.wobble });
        parent.add(light.mesh);
        lit.set(monster.id, { color, look, light, body: { value: 0, speed: 0 }, monster });
      }
      for (const [id, entry] of lit) {
        const found: MonsterState | undefined = here.get(id);
        const monster: MonsterState | undefined = found !== undefined && rankLookOf(found) === entry.look ? found : undefined;
        if (monster !== undefined) entry.monster = monster;
        const shown: boolean = monster !== undefined && rankShown(monster);
        entry.light.mesh.position.set(entry.monster.pos.x, floorUp(entry.monster.pos.x, RANK_LOOK.height, entry.monster.pos.z), entry.monster.pos.z);
        entry.light.show(shown ? entry.look.ground : 0);
        entry.light.step(dt, clock);
        stepShade(entry.body, shown ? entry.look.body : 0, dt);
        if (shown || entry.light.strength >= RANK_LOOK.gone || entry.body.value > 0) continue;
        drop(id, entry);
      }
    },
    bodyGlow(monsterId: number): RankGlow | null {
      const entry: Lit | undefined = lit.get(monsterId);
      return entry === undefined ? null : { color: entry.color, amount: entry.body.value };
    },
  };
}
