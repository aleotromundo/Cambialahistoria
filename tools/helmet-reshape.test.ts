import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HelmetShape } from './helmet-fit.ts';
import type { BentVertex, CheekGraft, FaceMarks, Point, Warp } from './helmet-reshape.ts';
import { bendVertex, cheekGrafter, faceWarp } from './helmet-reshape.ts';

const MARKS: FaceMarks = { bottom: 1.48, top: 1.78, slit: 1.624, mouthSlit: 1.53, eye: 1.656, mouth: 1.585 };

const AT = {
  front: 0.1,
  back: -0.12,
  close: 0.0005,
  rows: 60,
  side: 0.04,
  unit: 1e-6,
} as const;

void test('the eye line of the mask lands on the eyes and its mouth on the mouth', (): void => {
  const warp: Warp = faceWarp(MARKS);
  assert.ok(Math.abs(warp([0, MARKS.mouthSlit, AT.front])[1] - MARKS.mouth) < AT.close);
  const low: number = warp([0, MARKS.slit - 0.012, AT.front])[1];
  const high: number = warp([0, MARKS.slit + 0.016, AT.front])[1];
  assert.ok(low < MARKS.eye && high > MARKS.eye);
});

void test('the back of the helmet stays where it was', (): void => {
  const warp: Warp = faceWarp(MARKS);
  const point: Point = [AT.side, MARKS.slit, AT.back];
  assert.deepEqual(warp(point), point);
});

void test('rows of the face keep their order from chin to brow', (): void => {
  const warp: Warp = faceWarp(MARKS);
  const step: number = (MARKS.top - MARKS.bottom) / AT.rows;
  for (let row: number = 0; row < AT.rows; row += 1) {
    const y: number = MARKS.bottom + step * row;
    assert.ok(warp([AT.side, y + step, AT.front])[1] > warp([AT.side, y, AT.front])[1]);
  }
});

function plate(eye: number): HelmetShape {
  const positions: number[] = [];
  const indices: number[] = [];
  const across: number = 45;
  const tall: number = 40;
  for (let row: number = 0; row <= tall; row += 1) {
    for (let col: number = 0; col <= across; col += 1) {
      const x: number = -0.11 + (0.22 * col) / across;
      const y: number = eye - 0.08 + (0.11 * row) / tall;
      const dented: boolean = x > 0.05 && x < 0.08 && y > eye - 0.04 && y < eye - 0.01;
      positions.push(x, y, dented ? AT.front - 0.008 : AT.front);
    }
  }
  for (let row: number = 0; row < tall; row += 1) {
    for (let col: number = 0; col < across; col += 1) {
      const at: number = row * (across + 1) + col;
      indices.push(at, at + 1, at + across + 1, at + 1, at + across + 2, at + across + 1);
    }
  }
  return { positions, indices };
}

void test('a dent in the left cheek is replaced by a mirror of the right cheek', (): void => {
  const eye: number = MARKS.eye;
  const shape: HelmetShape = plate(eye);
  const graft: CheekGraft = cheekGrafter(shape, eye)(shape);
  const base: number = shape.positions.length / 3;
  assert.ok(graft.sources.length > 0);
  for (let at: number = 0; at < graft.sources.length; at += 1) {
    const x: number = graft.positions[at * 3] ?? 0;
    const y: number = graft.positions[at * 3 + 1] ?? 0;
    const z: number = graft.positions[at * 3 + 2] ?? 0;
    assert.ok(x > 0);
    if (x > 0.055 && x < 0.075 && y > eye - 0.035 && y < eye - 0.015) assert.ok(Math.abs(z - AT.front) < AT.close);
  }
  const keptDented: boolean = graft.indices.some((vertex: number): boolean => {
    if (vertex >= base) return false;
    const x: number = shape.positions[vertex * 3] ?? 0;
    const y: number = shape.positions[vertex * 3 + 1] ?? 0;
    return x > 0.06 && x < 0.07 && y > eye - 0.03 && y < eye - 0.02;
  });
  assert.equal(keptDented, false);
});

void test('the graft keeps the other cheek and the area outside the patch', (): void => {
  const eye: number = MARKS.eye;
  const shape: HelmetShape = plate(eye);
  const graft: CheekGraft = cheekGrafter(shape, eye)(shape);
  const kept = (wanted: (x: number, y: number) => boolean): boolean => graft.indices.some((vertex: number): boolean => wanted(shape.positions[vertex * 3] ?? 0, shape.positions[vertex * 3 + 1] ?? 0));
  assert.ok(kept((x: number, y: number): boolean => x < -0.06 && x > -0.07 && y > eye - 0.03 && y < eye - 0.02));
  assert.ok(kept((x: number, y: number): boolean => x > 0.06 && x < 0.07 && y > eye + 0.02));
});

void test('a bent normal stays unit length', (): void => {
  const bent: BentVertex = bendVertex([AT.side, MARKS.slit, AT.front], [0, 0, 1], faceWarp(MARKS));
  const length: number = Math.hypot(bent.normal[0], bent.normal[1], bent.normal[2]);
  assert.ok(Math.abs(length - 1) < AT.unit);
});
