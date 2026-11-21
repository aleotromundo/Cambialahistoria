import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import type { NavGrid } from './grid.ts';
import { buildNavGrid, navGridPrepared, navGridWork } from './grid.ts';

const content: Content = loadContent();

function zoneOf(id: string): ZoneDef {
  const zone: ZoneDef | undefined = content.zones.get(id);
  if (zone === undefined) throw new Error(`missing ${id}`);
  return { ...zone };
}

void test('a cave grid is built in many short steps, and once done every later grid is a copy of it', (): void => {
  const zone: ZoneDef = zoneOf('under_hall');
  const work: Generator<void, void> = navGridWork(zone, content.props, content.surfaces, content.player.radius);
  let steps: number = 0;
  while (work.next().done !== true) steps += 1;
  assert.ok(steps > 20, `only ${steps} steps`);
  assert.equal(navGridPrepared(zone, content.props, content.surfaces, content.player.radius), true);
  const first: NavGrid = buildNavGrid(zone, content.props, content.surfaces, content.player.radius);
  const second: NavGrid = buildNavGrid(zone, content.props, content.surfaces, content.player.radius);
  assert.notEqual(first.walkable, second.walkable);
  assert.deepEqual(first.walkable, second.walkable);
  assert.equal(navGridWork(zone, content.props, content.surfaces, content.player.radius).next().done, true);
});

void test('a grid being built in steps stops at its next step once the zone is entered and its grid is built at once', (): void => {
  const zone: ZoneDef = zoneOf('lava_depths');
  const work: Generator<void, void> = navGridWork(zone, content.props, content.surfaces, content.player.radius);
  for (let n: number = 0; n < 5; n += 1) assert.equal(work.next().done, false);
  const entered: NavGrid = buildNavGrid(zone, content.props, content.surfaces, content.player.radius);
  assert.equal(work.next().done, true);
  assert.deepEqual(buildNavGrid(zone, content.props, content.surfaces, content.player.radius).walkable, entered.walkable);
});

void test('every cell a hero can walk is ground, and the grid built in steps matches one built at once', (): void => {
  const stepped: ZoneDef = zoneOf('lava_depths');
  const whole: ZoneDef = zoneOf('lava_depths');
  const work: Generator<void, void> = navGridWork(stepped, content.props, content.surfaces, content.player.radius);
  while (work.next().done !== true);
  const fromSteps: NavGrid = buildNavGrid(stepped, content.props, content.surfaces, content.player.radius);
  const atOnce: NavGrid = buildNavGrid(whole, content.props, content.surfaces, content.player.radius);
  assert.deepEqual(fromSteps.walkable, atOnce.walkable);
  assert.deepEqual(fromSteps.ground, atOnce.ground);
  assert.deepEqual(fromSteps.solid, atOnce.solid);
  fromSteps.walkable.forEach((cell: number, at: number): void => {
    if (cell === 1) assert.equal(fromSteps.ground[at], 1);
  });
});

void test('every drift covers the same cells as a scan of the whole grid would find', (): void => {
  let checked: number = 0;
  const base: ZoneDef = zoneOf('hall_of_time');
  const width: number = base.tiles[0]?.length ?? 0;
  const spots: readonly (readonly [number, number, number, number])[] = [[0, 0, 1, 1], [2, 3, 3, 2], [width - 2, base.tiles.length - 2, 2, 2]];
  for (const [column, row, columns, rows] of spots) {
    const zone: ZoneDef = { ...base, drifts: [{ id: 'patch', column, row, columns, rows, period: 10, open: 0.5, offset: 0, fade: 1 }] };
    const grid: NavGrid = buildNavGrid(zone, content.props, content.surfaces, content.player.radius);
    for (const cells of grid.drifts) {
      const { drift } = cells;
      const whole: number[] = [];
      for (let cellRow: number = 0; cellRow < grid.rows; cellRow += 1) {
        for (let cellColumn: number = 0; cellColumn < grid.columns; cellColumn += 1) {
          const x: number = (cellColumn + 0.5) * grid.cellSize;
          const z: number = (cellRow + 0.5) * grid.cellSize;
          if (x >= drift.column * zone.cellSize && x < (drift.column + drift.columns) * zone.cellSize && z >= drift.row * zone.cellSize && z < (drift.row + drift.rows) * zone.cellSize) whole.push(cellRow * grid.columns + cellColumn);
        }
      }
      assert.deepEqual([...cells.cells], whole);
      checked += 1;
    }
  }
  assert.ok(checked > 0);
});
