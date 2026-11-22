import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellOf, createRectGrid, fileRect, firstEntry, nextEntry, ownerOf, RECT_GRID } from './rect-grid.ts';
import type { RectGrid } from './rect-grid.ts';

function ownersAt(grid: RectGrid, column: number, row: number): number[] {
  const owners: number[] = [];
  for (let entry: number = firstEntry(grid, column, row); entry >= 0; entry = nextEntry(grid, entry)) owners.push(ownerOf(grid, entry));
  return owners;
}

void test('a cell is the floor of the position over the cell size, held inside the grid', (): void => {
  assert.equal(cellOf(0, 10), 0);
  assert.equal(cellOf(RECT_GRID.cell - 0.001, 10), 0);
  assert.equal(cellOf(RECT_GRID.cell, 10), 1);
  assert.equal(cellOf(-500, 10), 0);
  assert.equal(cellOf(RECT_GRID.cell * 40, 10), 9);
  assert.equal(cellOf(Infinity, 10), 9);
});

void test('the grid covers the view with whole cells', (): void => {
  const grid: RectGrid = createRectGrid(RECT_GRID.cell * 3 + 1, RECT_GRID.cell * 2);
  assert.equal(grid.columns, 4);
  assert.equal(grid.rows, 2);
  assert.equal(createRectGrid(0, 0).columns, 1);
});

void test('a filed rect is listed in every cell it touches and in no other', (): void => {
  const grid: RectGrid = createRectGrid(RECT_GRID.cell * 4, RECT_GRID.cell * 4);
  fileRect(grid, 7, RECT_GRID.cell * 0.5, RECT_GRID.cell * 1.5, RECT_GRID.cell * 2.5, RECT_GRID.cell * 1.75);
  for (let row: number = 0; row < grid.rows; row += 1) {
    for (let column: number = 0; column < grid.columns; column += 1) {
      const touched: boolean = row === 1 && column <= 2;
      assert.deepEqual(ownersAt(grid, column, row), touched ? [7] : [], `cell ${column},${row}`);
    }
  }
});

void test('a rect past the edge of the view is filed in the edge cells', (): void => {
  const grid: RectGrid = createRectGrid(RECT_GRID.cell * 2, RECT_GRID.cell * 2);
  fileRect(grid, 3, -400, -400, -300, -300);
  fileRect(grid, 4, 900, 900, 1000, 1000);
  assert.deepEqual(ownersAt(grid, 0, 0), [3]);
  assert.deepEqual(ownersAt(grid, 1, 1), [4]);
});

void test('the grid keeps every rect when it outgrows its first capacity', (): void => {
  const grid: RectGrid = createRectGrid(RECT_GRID.cell, RECT_GRID.cell);
  const count: number = RECT_GRID.startCapacity * 3;
  for (let index: number = 0; index < count; index += 1) fileRect(grid, index, 1, 1, 2, 2);
  const owners: number[] = ownersAt(grid, 0, 0);
  assert.equal(owners.length, count);
  assert.deepEqual(owners.toSorted((a: number, b: number): number => a - b), Array.from({ length: count }, (_: unknown, index: number): number => index));
});
