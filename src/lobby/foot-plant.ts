import type { Object3D } from 'three';
import { SkinnedMesh, Vector3 } from 'three';

export const FOOT_PLANT = {
  reach: 0.3,
} as const;

export interface LowVertices {
  readonly mesh: SkinnedMesh;
  readonly indices: readonly number[];
}

export interface Footing {
  readonly lowest: number;
  readonly low: readonly LowVertices[];
}

const point: Vector3 = new Vector3();

function isSkinned(object: Object3D): object is SkinnedMesh {
  return object instanceof SkinnedMesh;
}

function heightOf(mesh: SkinnedMesh, index: number): number {
  return mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld).y;
}

export function footing(root: Object3D, reach: number = FOOT_PLANT.reach): Footing {
  root.updateMatrixWorld(true);
  const measured: { readonly mesh: SkinnedMesh; readonly heights: Float32Array }[] = [];
  let lowest: number = Number.POSITIVE_INFINITY;
  root.traverseVisible((node: Object3D): void => {
    if (!isSkinned(node)) return;
    const heights: Float32Array = new Float32Array(node.geometry.getAttribute('position').count);
    for (let index: number = 0; index < heights.length; index += 1) {
      const height: number = heightOf(node, index);
      heights[index] = height;
      if (height < lowest) lowest = height;
    }
    measured.push({ mesh: node, heights });
  });
  const low: LowVertices[] = [];
  for (const { mesh, heights } of measured) {
    const indices: number[] = [];
    for (let index: number = 0; index < heights.length; index += 1) if ((heights[index] ?? Number.POSITIVE_INFINITY) <= lowest + reach) indices.push(index);
    if (indices.length > 0) low.push({ mesh, indices });
  }
  return { lowest, low };
}

export function lowestOf(root: Object3D, low: readonly LowVertices[]): number {
  root.updateMatrixWorld(true);
  let lowest: number = Number.POSITIVE_INFINITY;
  for (const { mesh, indices } of low) {
    for (const index of indices) {
      const height: number = heightOf(mesh, index);
      if (height < lowest) lowest = height;
    }
  }
  return lowest;
}
