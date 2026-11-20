import type { Material, Object3D } from 'three';
import { Line, Mesh, Points, Sprite } from 'three';

const switchable: WeakMap<object, Material> = new WeakMap<object, Material>();

export function markSeeThrough(material: Material): void {
  switchable.set(material, material);
}

export function canSeeThrough(material: Material): boolean {
  return switchable.has(material);
}

function ownMaterials(object: Object3D): readonly unknown[] {
  if (!(object instanceof Mesh || object instanceof Points || object instanceof Line || object instanceof Sprite)) return [];
  const held: unknown = object.material;
  return Array.isArray(held) ? held : [held];
}

export function opaqueSwitchables(object: Object3D): Material[] {
  const found: Material[] = [];
  for (const held of ownMaterials(object)) {
    const material: Material | undefined = typeof held === 'object' && held !== null ? switchable.get(held) : undefined;
    if (material === undefined || material.transparent || found.includes(material)) continue;
    found.push(material);
  }
  return found;
}

export function asSeeThrough<T>(materials: readonly Material[], work: () => T): T {
  for (const material of materials) {
    material.transparent = true;
    material.needsUpdate = true;
  }
  try {
    return work();
  } finally {
    for (const material of materials) {
      material.transparent = false;
      material.needsUpdate = true;
    }
  }
}
