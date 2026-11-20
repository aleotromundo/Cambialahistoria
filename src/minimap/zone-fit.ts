import type { ExploreGrid } from '../../sim/world/exploration.ts';

export interface WorldBox {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
}

export interface FitView {
  readonly width: number;
  readonly height: number;
  readonly squash: number;
  readonly top: number;
  readonly bottom: number;
  readonly side: number;
  readonly minScale: number;
  readonly maxScale: number;
  readonly keepMargin: number;
}

export interface KeepPoint {
  readonly x: number;
  readonly z: number;
}

export interface MapFit {
  readonly scale: number;
  readonly focusX: number;
  readonly focusZ: number;
  readonly centreX: number;
  readonly centreY: number;
}

const DIAGONAL: number = Math.SQRT1_2;

export function seenBox(seen: Uint8Array, grid: ExploreGrid): WorldBox | null {
  let minColumn: number = grid.columns;
  let minRow: number = grid.rows;
  let maxColumn: number = -1;
  let maxRow: number = -1;
  for (let row: number = 0; row < grid.rows; row += 1) {
    const start: number = row * grid.columns;
    for (let column: number = 0; column < grid.columns; column += 1) {
      if (seen[start + column] !== 1) continue;
      minColumn = Math.min(minColumn, column);
      maxColumn = Math.max(maxColumn, column);
      minRow = Math.min(minRow, row);
      maxRow = Math.max(maxRow, row);
    }
  }
  if (maxColumn < 0) return null;
  return { minX: minColumn * grid.cellSize, minZ: minRow * grid.cellSize, maxX: (maxColumn + 1) * grid.cellSize, maxZ: (maxRow + 1) * grid.cellSize };
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

export function fitBox(box: WorldBox, view: FitView, keep: KeepPoint): MapFit {
  const across: number = Math.max(1e-6, box.maxX - box.minZ - (box.minX - box.maxZ));
  const down: number = Math.max(1e-6, box.maxX + box.maxZ - (box.minX + box.minZ));
  const roomX: number = Math.max(1, view.width - view.side * 2);
  const roomY: number = Math.max(1, view.height - view.top - view.bottom);
  const whole: number = Math.min(roomX / (DIAGONAL * across), roomY / (DIAGONAL * view.squash * down));
  const scale: number = clamp(whole, view.minScale, view.maxScale);
  const centre = { centreX: view.width / 2, centreY: view.top + roomY / 2 };
  const middleU: number = (box.maxX - box.minZ + (box.minX - box.maxZ)) / 2;
  const middleV: number = (box.maxX + box.maxZ + (box.minX + box.minZ)) / 2;
  const reachU: number = (roomX / 2 / (DIAGONAL * scale)) * (1 - view.keepMargin);
  const reachV: number = (roomY / 2 / (DIAGONAL * view.squash * scale)) * (1 - view.keepMargin);
  const keepU: number = keep.x - keep.z;
  const keepV: number = keep.x + keep.z;
  const u: number = scale <= whole ? middleU : clamp(middleU, keepU - reachU, keepU + reachU);
  const v: number = scale <= whole ? middleV : clamp(middleV, keepV - reachV, keepV + reachV);
  return { scale, focusX: (u + v) / 2, focusZ: (v - u) / 2, ...centre };
}

export function easeFit(from: MapFit | null, to: MapFit, blend: number): MapFit {
  if (from === null) return to;
  const mix = (a: number, b: number): number => a + (b - a) * blend;
  return { scale: mix(from.scale, to.scale), focusX: mix(from.focusX, to.focusX), focusZ: mix(from.focusZ, to.focusZ), centreX: to.centreX, centreY: to.centreY };
}
