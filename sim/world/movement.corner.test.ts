import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MOTION_DT } from '../../test/motion-support.ts';
import { must, worldIn } from '../../test/support.ts';
import { UNRANKED_CONTENT as content } from '../../test/unranked-support.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { routedGrid } from '../nav/grid.ts';
import type { NavGrid } from '../nav/grid.ts';
import type { Steering } from './movement.ts';
import { steerAlong } from './movement.ts';
import type { World } from './types.ts';

const STEER: Steering = { maxTurnRate: 11.5, minTurnRate: 2, turnGain: 20, fullSpeedAngle: 0.25, sharpAngle: 1, sharpSpeed: 0.3, passRadius: 0.45, settleRadius: 0.2 };

const CORNER = {
  prop: 'castle_wall_ruin',
  at: { x: 66.5, z: 14 },
  pinned: { x: 2.38174247403319, z: -1.118096781669411 },
  facing: 0.0958079,
  waypoint: { x: 2.75, z: 1.25 },
  seconds: 1,
  speed: 3.7,
  freed: 0.5,
} as const;

void test('a body pressed into a wall corner, facing the way the wall turns it, works its way off the corner instead of standing still', (): void => {
  const world: World = worldIn(content, content.world.start, 2);
  const wall = must(world.zone.props.find((placed): boolean => placed.prop === CORNER.prop && placed.x === CORNER.at.x && placed.z === CORNER.at.z), 'the wall ruin');
  const grid: NavGrid = routedGrid(world.grid);
  const start: Vec2 = { x: wall.x + CORNER.pinned.x, z: wall.z + CORNER.pinned.z };
  const waypoint: Vec2 = { x: wall.x + CORNER.waypoint.x, z: wall.z + CORNER.waypoint.z };
  const body = world.player;
  body.pos = { ...start };
  body.facing = CORNER.facing;
  const path: Vec2[] = [waypoint];
  for (let step: number = 0; step < Math.round(CORNER.seconds / MOTION_DT); step += 1) steerAlong(grid, body, path, CORNER.speed * MOTION_DT, MOTION_DT, STEER);
  assert.ok(distance(body.pos, start) >= CORNER.freed, `moved ${distance(body.pos, start).toFixed(2)} from the corner`);
});
