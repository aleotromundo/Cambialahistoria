import type { Camera, Object3D, Scene, Texture } from 'three';
import { Group, Mesh, MeshStandardMaterial } from 'three';
import type { FramePacer } from './paced-work.ts';
import { uploadPaced } from './warm-up.ts';

export interface MomentCompiler {
  compileAsync(target: Object3D, viewer: Camera, lit: Scene): Promise<unknown>;
  initTexture(texture: Texture): void;
}

export interface WarmTarget {
  readonly renderer: MomentCompiler;
  readonly camera: Camera;
}

export function figureTextures(roots: readonly Object3D[]): Texture[] {
  const textures: Set<Texture> = new Set<Texture>();
  for (const root of roots) {
    root.traverse((object: Object3D): void => {
      if (!(object instanceof Mesh)) return;
      const materials: readonly unknown[] = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) if (material instanceof MeshStandardMaterial) for (const texture of [material.map, material.normalMap, material.roughnessMap, material.emissiveMap]) if (texture !== null) textures.add(texture);
    });
  }
  return [...textures];
}

function compileAlone(renderer: MomentCompiler, roots: readonly Object3D[], camera: Camera, scene: Scene): Promise<unknown> {
  const holder: Group = new Group();
  holder.children = [...roots];
  try {
    return renderer.compileAsync(holder, camera, scene);
  } finally {
    holder.children = [];
  }
}

export async function warmRoots(renderer: MomentCompiler, roots: readonly Object3D[], camera: Camera, scene: Scene, uploaded: WeakMap<Texture, number>, pacer: FramePacer): Promise<void> {
  await compileAlone(renderer, roots, camera, scene).catch((): undefined => undefined);
  await uploadPaced(renderer, figureTextures(roots), uploaded, pacer);
}
