import type { Object3D, Side } from 'three';
import { BackSide, DoubleSide, FrontSide, InstancedMesh, Material, Mesh, MeshDepthMaterial, SkinnedMesh, Texture } from 'three';

const SHADOW_SIDE: Readonly<Record<Side, Side>> = { [FrontSide]: BackSide, [BackSide]: FrontSide, [DoubleSide]: DoubleSide };

export interface SteadyShadows {
  steady(root: Object3D): void;
  depthFor(mesh: Mesh): MeshDepthMaterial | null;
}

function textureOf(material: Material, key: string): Texture | null {
  const value: unknown = Reflect.get(material, key);
  return value instanceof Texture ? value : null;
}

function isMesh(object: Object3D): object is Mesh {
  return object instanceof Mesh;
}

function firstMaterial(mesh: Mesh): Material | null {
  const held: unknown = mesh.material;
  const first: unknown = Array.isArray(held) ? held[0] : held;
  return first instanceof Material ? first : null;
}

export function depthKey(mesh: Mesh): string | null {
  const material: Material | null = firstMaterial(mesh);
  if (material === null) return null;
  if (material.alphaTest > 0 || material.alphaToCoverage) return null;
  if (textureOf(material, 'alphaMap') !== null || textureOf(material, 'displacementMap') !== null) return null;
  if (material.clippingPlanes !== null && material.clippingPlanes.length > 0) return null;
  const map: Texture | null = textureOf(material, 'map');
  const morphs: number = mesh.geometry.morphAttributes['position']?.length ?? 0;
  const instanced: string = mesh instanceof InstancedMesh ? `instanced:${mesh.instanceColor === null ? 'plain' : 'coloured'}:${mesh.morphTexture === null ? 'still' : 'morph'}` : 'single';
  const side: Side = material.shadowSide ?? SHADOW_SIDE[material.side];
  return [mesh instanceof SkinnedMesh ? 'skinned' : 'rigid', instanced, `morphs:${morphs}`, map === null ? 'nomap' : `map:${map.channel}`, `side:${side}`, Reflect.get(material, 'wireframe') === true ? 'wire' : 'solid'].join('|');
}

export function createSteadyShadows(): SteadyShadows {
  const pool: Map<string, MeshDepthMaterial> = new Map<string, MeshDepthMaterial>();
  const depthFor = (mesh: Mesh): MeshDepthMaterial | null => {
    const key: string | null = depthKey(mesh);
    if (key === null) return null;
    const found: MeshDepthMaterial | undefined = pool.get(key);
    if (found !== undefined) return found;
    const made: MeshDepthMaterial = new MeshDepthMaterial();
    pool.set(key, made);
    return made;
  };
  return {
    depthFor,
    steady(root: Object3D): void {
      root.traverse((object: Object3D): void => {
        if (!isMesh(object) || !object.castShadow || object.customDepthMaterial !== undefined) return;
        const depth: MeshDepthMaterial | null = depthFor(object);
        if (depth !== null) object.customDepthMaterial = depth;
      });
    },
  };
}
