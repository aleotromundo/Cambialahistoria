import { Matrix3, Vector3 } from 'three';
import { smoothstep } from './headgear-shapes.ts';
import type { HelmetShape } from './helmet-fit.ts';

export type Point = readonly [number, number, number];

export type Warp = (point: Point) => Point;

export interface FaceMarks {
  readonly bottom: number;
  readonly top: number;
  readonly slit: number;
  readonly mouthSlit: number;
  readonly eye: number;
  readonly mouth: number;
}

export interface BentVertex {
  readonly point: Point;
  readonly normal: Point;
}

export interface CheekGraft {
  readonly indices: readonly number[];
  readonly sources: readonly number[];
  readonly positions: readonly number[];
}

interface Knot {
  readonly x: number;
  readonly y: number;
}

interface Span {
  readonly from: Knot;
  readonly to: Knot;
  readonly fromSlope: number;
  readonly toSlope: number;
}

const RESHAPE = {
  chinLift: 0.03,
  browLift: 0.012,
  slitBelow: 0.012,
  slitAbove: 0.016,
  openBelow: 0.018,
  openAbove: 0.021,
  frontFrom: -0.07,
  frontTo: 0.03,
  bandWidth: 0.035,
  pinch: 0.014,
  pinchAt: 0.052,
  pinchWidth: 0.03,
  centreFade: 0.02,
  level: 0.3,
  levelAt: 0.05,
  levelFadeFrom: 0.08,
  levelFadeTo: 0.11,
  openFadeFrom: 0.068,
  openFadeTo: 0.09,
  probe: 0.0005,
} as const;

const HEAL = {
  cell: 0.002,
  halfWidth: 0.11,
  below: 0.08,
  above: 0.03,
  nearest: 0.02,
  blurRadius: 2,
  blurPasses: 2,
  most: 0.03,
  innerFrom: 0.033,
  innerTo: 0.049,
  outerFrom: 0.09,
  outerTo: 0.102,
  lowFrom: -0.07,
  lowTo: -0.058,
  highFrom: 0.002,
  highTo: 0.012,
  overlap: 0.002,
} as const;

interface HeightGrid {
  readonly x0: number;
  readonly y0: number;
  readonly cols: number;
  readonly rows: number;
}

function gridAround(eye: number): HeightGrid {
  return { x0: -HEAL.halfWidth, y0: eye - HEAL.below, cols: Math.round((2 * HEAL.halfWidth) / HEAL.cell), rows: Math.round((HEAL.below + HEAL.above) / HEAL.cell) };
}

function cornerOf(shape: HelmetShape, index: number): Point {
  const at: number = (shape.indices[index] ?? 0) * 3;
  return [shape.positions[at] ?? 0, shape.positions[at + 1] ?? 0, shape.positions[at + 2] ?? 0];
}

function outerHeights(shape: HelmetShape, grid: HeightGrid): Float32Array {
  const heights: Float32Array = new Float32Array(grid.cols * grid.rows).fill(-Infinity);
  for (let index: number = 0; index + 2 < shape.indices.length; index += 3) {
    const a: Point = cornerOf(shape, index);
    const b: Point = cornerOf(shape, index + 1);
    const c: Point = cornerOf(shape, index + 2);
    if (Math.max(a[2], b[2], c[2]) < HEAL.nearest) continue;
    const area: number = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (area === 0) continue;
    const left: number = Math.max(0, Math.floor((Math.min(a[0], b[0], c[0]) - grid.x0) / HEAL.cell));
    const right: number = Math.min(grid.cols - 1, Math.ceil((Math.max(a[0], b[0], c[0]) - grid.x0) / HEAL.cell));
    const low: number = Math.max(0, Math.floor((Math.min(a[1], b[1], c[1]) - grid.y0) / HEAL.cell));
    const high: number = Math.min(grid.rows - 1, Math.ceil((Math.max(a[1], b[1], c[1]) - grid.y0) / HEAL.cell));
    for (let row: number = low; row <= high; row += 1) {
      for (let col: number = left; col <= right; col += 1) {
        const x: number = grid.x0 + (col + 0.5) * HEAL.cell;
        const y: number = grid.y0 + (row + 0.5) * HEAL.cell;
        const u: number = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / area;
        const v: number = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / area;
        const w: number = 1 - u - v;
        if (u < 0 || v < 0 || w < 0) continue;
        const z: number = u * a[2] + v * b[2] + w * c[2];
        const cell: number = row * grid.cols + col;
        if (z > (heights[cell] ?? -Infinity)) heights[cell] = z;
      }
    }
  }
  return heights;
}

function along(source: Float32Array, stride: number, lines: number, length: number, gap: number): Float32Array {
  const out: Float32Array = new Float32Array(source.length);
  for (let line: number = 0; line < lines; line += 1) {
    for (let at: number = 0; at < length; at += 1) {
      let sum: number = 0;
      let count: number = 0;
      for (let near: number = Math.max(0, at - HEAL.blurRadius); near <= Math.min(length - 1, at + HEAL.blurRadius); near += 1) {
        sum += source[line * gap + near * stride] ?? 0;
        count += 1;
      }
      out[line * gap + at * stride] = sum / count;
    }
  }
  return out;
}

function blurred(values: Float32Array, grid: HeightGrid): Float32Array {
  let result: Float32Array = values;
  for (let pass: number = 0; pass < HEAL.blurPasses; pass += 1) result = along(along(result, 1, grid.rows, grid.cols, grid.cols), grid.cols, grid.cols, grid.rows, 1);
  return result;
}

function sampled(values: Float32Array, grid: HeightGrid, x: number, y: number): number {
  const col: number = (x - grid.x0) / HEAL.cell - 0.5;
  const row: number = (y - grid.y0) / HEAL.cell - 0.5;
  const left: number = Math.floor(col);
  const low: number = Math.floor(row);
  if (left < 0 || low < 0 || left + 1 >= grid.cols || low + 1 >= grid.rows) return 0;
  const across: number = col - left;
  const up: number = row - low;
  const at = (c: number, r: number): number => values[r * grid.cols + c] ?? 0;
  return (at(left, low) * (1 - across) + at(left + 1, low) * across) * (1 - up) + (at(left, low + 1) * (1 - across) + at(left + 1, low + 1) * across) * up;
}

export function cheekGrafter(whole: HelmetShape, eye: number): (primitive: HelmetShape) => CheekGraft {
  const grid: HeightGrid = gridAround(eye);
  const heights: Float32Array = outerHeights(whole, grid);
  const change: Float32Array = new Float32Array(heights.length);
  for (let row: number = 0; row < grid.rows; row += 1) {
    for (let col: number = Math.ceil(grid.cols / 2); col < grid.cols; col += 1) {
      const here: number = heights[row * grid.cols + col] ?? -Infinity;
      const mirror: number = heights[row * grid.cols + (grid.cols - 1 - col)] ?? -Infinity;
      if (here === -Infinity || mirror === -Infinity) continue;
      change[row * grid.cols + col] = Math.min(HEAL.most, Math.max(-HEAL.most, here - mirror));
    }
  }
  const soft: Float32Array = blurred(change, grid);
  const inCore = (x: number, y: number): boolean => x >= HEAL.innerFrom && x <= HEAL.outerTo && y >= eye + HEAL.lowFrom && y <= eye + HEAL.highTo;
  const inPatch = (x: number, y: number): boolean => x >= HEAL.innerFrom - HEAL.overlap && x <= HEAL.outerTo + HEAL.overlap && y >= eye + HEAL.lowFrom - HEAL.overlap && y <= eye + HEAL.highTo + HEAL.overlap;
  const settled = (x: number, y: number): number => smoothstep(HEAL.innerFrom, HEAL.innerTo, x) * (1 - smoothstep(HEAL.outerFrom, HEAL.outerTo, x)) * smoothstep(eye + HEAL.lowFrom, eye + HEAL.lowTo, y) * (1 - smoothstep(eye + HEAL.highFrom, eye + HEAL.highTo, y));
  return (primitive: HelmetShape): CheekGraft => {
    const base: number = primitive.positions.length / 3;
    const indices: number[] = [];
    const added: number[] = [];
    const sources: number[] = [];
    const positions: number[] = [];
    const copies: Map<number, number> = new Map<number, number>();
    for (let index: number = 0; index + 2 < primitive.indices.length; index += 3) {
      const a: Point = cornerOf(primitive, index);
      const b: Point = cornerOf(primitive, index + 1);
      const c: Point = cornerOf(primitive, index + 2);
      const x: number = (a[0] + b[0] + c[0]) / 3;
      const y: number = (a[1] + b[1] + c[1]) / 3;
      const front: boolean = (a[2] + b[2] + c[2]) / 3 >= HEAL.nearest;
      if (!(front && x > 0 && inCore(x, y))) indices.push(primitive.indices[index] ?? 0, primitive.indices[index + 1] ?? 0, primitive.indices[index + 2] ?? 0);
      if (!front || x >= 0 || !inPatch(-x, y)) continue;
      const corners: readonly (readonly [number, Point])[] = [[index + 2, c], [index + 1, b], [index, a]];
      for (const [corner, point] of corners) {
        const vertex: number = primitive.indices[corner] ?? 0;
        const known: number | undefined = copies.get(vertex);
        if (known !== undefined) {
          added.push(known);
          continue;
        }
        const mirroredX: number = -point[0];
        const copy: number = base + sources.length;
        copies.set(vertex, copy);
        added.push(copy);
        sources.push(vertex);
        positions.push(mirroredX, point[1], point[2] + (1 - settled(mirroredX, point[1])) * sampled(soft, grid, mirroredX, point[1]));
      }
    }
    return { indices: [...indices, ...added], sources, positions };
  };
}

function pairs<T>(list: readonly T[]): (readonly [T, T])[] {
  const found: (readonly [T, T])[] = [];
  list.forEach((item: T, index: number): void => {
    const next: T | undefined = list[index + 1];
    if (next !== undefined) found.push([item, next]);
  });
  return found;
}

function monotone(knots: readonly Knot[]): (x: number) => number {
  const chords: number[] = pairs(knots).map(([from, to]: readonly [Knot, Knot]): number => (to.y - from.y) / (to.x - from.x));
  const slopes: number[] = knots.map((_: Knot, index: number): number => {
    const before: number | undefined = chords[index - 1];
    const after: number | undefined = chords[index];
    if (before === undefined) return after ?? 1;
    if (after === undefined) return before;
    return before * after <= 0 ? 0 : (2 * before * after) / (before + after);
  });
  const spans: Span[] = pairs(knots).map(([from, to]: readonly [Knot, Knot], index: number): Span => ({ from, to, fromSlope: slopes[index] ?? 1, toSlope: slopes[index + 1] ?? 1 }));
  const first: Span | undefined = spans[0];
  const last: Span | undefined = spans[spans.length - 1];
  if (first === undefined || last === undefined) throw new Error('a curve needs two knots');
  return (x: number): number => {
    if (x <= first.from.x) return first.from.y + (x - first.from.x) * first.fromSlope;
    if (x >= last.to.x) return last.to.y + (x - last.to.x) * last.toSlope;
    const span: Span = spans.find((candidate: Span): boolean => x <= candidate.to.x) ?? last;
    const width: number = span.to.x - span.from.x;
    const t: number = (x - span.from.x) / width;
    const square: number = t * t;
    const cube: number = square * t;
    return (2 * cube - 3 * square + 1) * span.from.y + (cube - 2 * square + t) * width * span.fromSlope + (3 * square - 2 * cube) * span.to.y + (cube - square) * width * span.toSlope;
  };
}

export function faceWarp(marks: FaceMarks): Warp {
  const chin: Knot = { x: marks.bottom, y: marks.bottom + RESHAPE.chinLift };
  const mouth: Knot = { x: marks.mouthSlit, y: marks.mouth };
  const brow: Knot = { x: marks.top, y: marks.top + RESHAPE.browLift };
  const shifted = monotone([chin, mouth, { x: marks.slit, y: marks.eye }, brow]);
  const opened = monotone([chin, mouth, { x: marks.slit - RESHAPE.slitBelow, y: marks.eye - RESHAPE.openBelow }, { x: marks.slit + RESHAPE.slitAbove, y: marks.eye + RESHAPE.openAbove }, brow]);
  return ([x, y, z]: Point): Point => {
    const front: number = smoothstep(RESHAPE.frontFrom, RESHAPE.frontTo, z);
    const side: number = Math.abs(x);
    const band: number = Math.exp(-(((y - marks.slit) / RESHAPE.bandWidth) ** 2)) * front;
    const centre: number = smoothstep(0, RESHAPE.centreFade, side);
    const open: number = opened(y);
    const target: number = open + (shifted(y) - open) * smoothstep(RESHAPE.openFadeFrom, RESHAPE.openFadeTo, side);
    const level: number = -RESHAPE.level * (side - RESHAPE.levelAt) * band * centre * (1 - smoothstep(RESHAPE.levelFadeFrom, RESHAPE.levelFadeTo, side));
    const pinch: number = RESHAPE.pinch * Math.exp(-(((side - RESHAPE.pinchAt) / RESHAPE.pinchWidth) ** 2)) * centre * band;
    return [x - Math.sign(x) * pinch, y + front * (target - y) + level, z];
  };
}

function probed(point: Point, axis: number, step: number): Point {
  return [point[0] + (axis === 0 ? step : 0), point[1] + (axis === 1 ? step : 0), point[2] + (axis === 2 ? step : 0)];
}

function column(point: Point, axis: number, warp: Warp): Point {
  const low: Point = warp(probed(point, axis, -RESHAPE.probe));
  const high: Point = warp(probed(point, axis, RESHAPE.probe));
  const span: number = 2 * RESHAPE.probe;
  return [(high[0] - low[0]) / span, (high[1] - low[1]) / span, (high[2] - low[2]) / span];
}

export function bendVertex(point: Point, normal: Point, warp: Warp): BentVertex {
  const a: Point = column(point, 0, warp);
  const b: Point = column(point, 1, warp);
  const c: Point = column(point, 2, warp);
  const inverse: Matrix3 = new Matrix3().set(a[0], b[0], c[0], a[1], b[1], c[1], a[2], b[2], c[2]).invert().transpose();
  const bent: Vector3 = new Vector3(normal[0], normal[1], normal[2]).applyMatrix3(inverse).normalize();
  return { point: warp(point), normal: [bent.x, bent.y, bent.z] };
}
