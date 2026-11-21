import type { Object3D, Skeleton } from 'three';
import { SkinnedMesh } from 'three';

let poseTick: number = 0;
const posedOnce: WeakSet<Skeleton> = new WeakSet<Skeleton>();

export function nextPoseTick(): void {
  poseTick += 1;
}

export function poseOncePerTick(root: Object3D): number {
  let held: number = 0;
  root.traverse((object: Object3D): void => {
    if (!(object instanceof SkinnedMesh) || posedOnce.has(object.skeleton)) return;
    const skeleton: Skeleton = object.skeleton;
    const pose: () => void = skeleton.update.bind(skeleton);
    let posedAt: number = poseTick - 1;
    skeleton.update = (): void => {
      if (posedAt === poseTick) return;
      posedAt = poseTick;
      pose();
    };
    posedOnce.add(skeleton);
    held += 1;
  });
  return held;
}
