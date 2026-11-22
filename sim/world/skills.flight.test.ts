import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { SkillDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { cellIndex } from '../nav/grid.ts';
import { startSkill } from './skills.ts';
import { stepWorld } from './step.ts';
import type { MonsterState, World } from './types.ts';

const DT: number = 1 / 60;

function trench(world: World, x: number): void {
  for (let z: number = 0; z < world.grid.rows * world.grid.cellSize; z += world.grid.cellSize) {
    const index: number = cellIndex(world.grid, x, z);
    world.grid.walkable[index] = 0;
  }
}

void test('a leap flies over ground it cannot walk and never jumps to its landing in one step', (): void => {
  const world: World = arena(6);
  const ghoul: MonsterState = place(world, 'test_ghoul', { x: ARENA_CENTRE.x + 7, z: ARENA_CENTRE.z });
  const pounce: SkillDef = must(world.content.skills.get('test_pounce'), 'pounce');
  const leap = must(pounce.leap, 'leap');
  const hero: Vec2 = { ...world.player.pos };
  startSkill(world, ghoul, pounce, { x: hero.x - ghoul.pos.x, z: hero.z - ghoul.pos.z });
  const landing: Vec2 = must(ghoul.action?.target, 'landing point');
  const flight: number = must(ghoul.action, 'action').travelLeft;
  trench(world, (ghoul.pos.x + landing.x) / 2);
  const fastest: number = (flight / leap.airTime) * DT * 1.5;
  let widest: number = 0;
  for (let step: number = 0; step < Math.round((pounce.windup + 0.1) / DT); step += 1) {
    world.player.pos = { ...hero };
    const before: Vec2 = { ...ghoul.pos };
    stepWorld(world, [], DT);
    widest = Math.max(widest, distance(before, ghoul.pos));
  }
  assert.ok(distance(landing, ghoul.pos) < 0.3, `it landed at the mark (${distance(landing, ghoul.pos).toFixed(2)} away)`);
  assert.ok(widest <= fastest, `it moved ${widest.toFixed(2)} m in one step, more than its flight allows (${fastest.toFixed(2)} m)`);
});
