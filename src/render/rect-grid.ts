export const RECT_GRID = {
  cell: 32,
  startCapacity: 256,
} as const;

export interface RectGrid {
  readonly columns: number;
  readonly rows: number;
  readonly head: Int32Array;
  next: Int32Array;
  owner: Int32Array;
  count: number;
}

export function createRectGrid(width: number, height: number): RectGrid {
  const columns: number = Math.max(1, Math.ceil(width / RECT_GRID.cell));
  const rows: number = Math.max(1, Math.ceil(height / RECT_GRID.cell));
  return { columns, rows, head: new Int32Array(columns * rows).fill(-1), next: new Int32Array(RECT_GRID.startCapacity), owner: new Int32Array(RECT_GRID.startCapacity), count: 0 };
}

export function cellOf(value: number, cells: number): number {
  const cell: number = Math.floor(value / RECT_GRID.cell);
  return cell < 0 ? 0 : cell >= cells ? cells - 1 : cell;
}

function grow(grid: RectGrid): void {
  const next: Int32Array = new Int32Array(grid.next.length * 2);
  next.set(grid.next);
  grid.next = next;
  const owner: Int32Array = new Int32Array(grid.owner.length * 2);
  owner.set(grid.owner);
  grid.owner = owner;
}

export function fileRect(grid: RectGrid, index: number, left: number, top: number, right: number, bottom: number): void {
  const lastColumn: number = cellOf(right, grid.columns);
  const lastRow: number = cellOf(bottom, grid.rows);
  for (let row: number = cellOf(top, grid.rows); row <= lastRow; row += 1) {
    for (let column: number = cellOf(left, grid.columns); column <= lastColumn; column += 1) {
      if (grid.count === grid.owner.length) grow(grid);
      const cell: number = row * grid.columns + column;
      grid.owner[grid.count] = index;
      grid.next[grid.count] = grid.head[cell] ?? -1;
      grid.head[cell] = grid.count;
      grid.count += 1;
    }
  }
}

export function firstEntry(grid: RectGrid, column: number, row: number): number {
  return grid.head[row * grid.columns + column] ?? -1;
}

export function nextEntry(grid: RectGrid, entry: number): number {
  return grid.next[entry] ?? -1;
}

export function ownerOf(grid: RectGrid, entry: number): number {
  return grid.owner[entry] ?? -1;
}
