import type { Euler, Object3D } from 'three';
import { Bone } from 'three';

function keepAngles(angles: Euler): void {
  angles.setFromQuaternion = (): Euler => angles;
}

export function quietBones(root: Object3D): number {
  let quieted: number = 0;
  root.traverse((object: Object3D): void => {
    if (!(object instanceof Bone)) return;
    keepAngles(object.rotation);
    quieted += 1;
  });
  return quieted;
}
