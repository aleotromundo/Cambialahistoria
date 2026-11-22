import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Group, Object3D } from 'three';
import { Color, Material, Mesh } from 'three';
import { loadContent } from '../../sim/content/content.ts';
import type { SkillDef } from '../../sim/content/types.ts';
import type { VfxGather } from '../../sim/content/vfx-types.ts';
import { must } from '../../test/support.ts';
import type { GatherKit } from './gather-orb.ts';
import { createGatherOrbs, gatherOrbKeepers } from './gather-orb.ts';

interface ProgramShape {
  readonly type: string;
  readonly transparent: boolean;
  readonly blending: number;
  readonly side: number;
  readonly depthWrite: boolean;
  readonly forceSinglePass: boolean;
}

function shapesOf(objects: readonly Object3D[]): ProgramShape[] {
  const shapes: ProgramShape[] = [];
  for (const object of objects) {
    object.traverse((part: Object3D): void => {
      if (!(part instanceof Mesh)) return;
      const held: unknown = part.material;
      const materials: readonly unknown[] = Array.isArray(held) ? held : [held];
      for (const material of materials) {
        if (material instanceof Material) shapes.push({ type: material.type, transparent: material.transparent, blending: material.blending, side: material.side, depthWrite: material.depthWrite, forceSinglePass: material.forceSinglePass });
      }
    });
  }
  return shapes.toSorted((a: ProgramShape, b: ProgramShape): number => a.type.localeCompare(b.type));
}

void test('the gather orb keepers warm the same programs a gathering cast draws', (): void => {
  const skill: SkillDef = must(loadContent().skills.get('fire_burst'), 'fire_burst');
  const look: VfxGather = must(skill.vfx.gather, 'fire burst gather');
  const drawn: Object3D[] = [];
  const kit: GatherKit = {
    add: (object: Mesh | Group): void => {
      drawn.push(object);
    },
    spray: (): void => undefined,
    gather: (): void => undefined,
    flashLight: (): void => undefined,
  };
  createGatherOrbs(kit).start(1, { x: 0, z: 0 }, 1, look, skill.windup, new Color(0xff8040));
  assert.equal(drawn.length, 1);
  assert.deepEqual(shapesOf(gatherOrbKeepers(new Color(0xffffff))), shapesOf(drawn));
});
