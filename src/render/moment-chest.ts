import type { Material, Object3D } from 'three';
import { BufferGeometry, Color, Group, Matrix4, Mesh, MeshStandardMaterial } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { MomentChest } from '../../sim/content/moment-types.ts';
import type { PropDef, PropLid } from '../../sim/content/types.ts';
import type { ChestState } from '../../sim/world/types.ts';
import type { Spring } from '../hud/character-spring.ts';
import { springTo, stepSpring } from '../hud/character-spring.ts';
import type { Dresser } from './character-loader.ts';
import type { GhostUniforms, RigGlow } from './ghost-material.ts';
import { createGhostUniforms, makeGhost } from './ghost-material.ts';
import type { GroundLight } from './ground-light.ts';
import { createGroundLight, GROUND_LIGHT } from './ground-light.ts';
import { lidAngle, splitAtSeam } from './prop-lid.ts';

export const MOMENT_CHEST = {
  sink: 0.5,
  startScale: 0.6,
  glowRadius: 1.5,
  glowFill: 0.8,
  glowBand: 0.3,
  glowWidth: 0.5,
  glowWobble: 0.25,
  glowClosed: 0.35,
  glowPulse: 0.25,
  glowRate: 2.6,
  glowOpen: 0.9,
  glowFall: 1.4,
} as const;

const CHEST_GLOW: Color = new Color(0xffc45a);
const WHITE: Color = new Color(0xffffff);
const NO_LID: PropLid = { seam: Number.POSITIVE_INFINITY, hinge: 0, degrees: 0 };

export interface ChestView {
  readonly root: Group;
  readonly lid: Group;
  readonly ghost: GhostUniforms;
  readonly materials: MeshStandardMaterial[];
  readonly geometries: BufferGeometry[];
  readonly glow: GroundLight;
  readonly rise: Spring;
  readonly swing: Spring;
  readonly scale: number;
  readonly hinge: PropLid;
  opened: number;
}

export interface ChestMaking {
  readonly prop: PropDef;
  readonly model: GLTF;
  readonly dresser: Dresser;
  readonly flash: RigGlow;
}

export interface ChestMoment {
  readonly state: ChestState;
  readonly fade: number;
  readonly clock: number;
}

function isGeometry(value: unknown): value is BufferGeometry {
  return value instanceof BufferGeometry;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function buildChest(making: ChestMaking, holder: Group, chest: MomentChest): ChestView {
  const { prop, model } = making;
  const hinge: PropLid = prop.lid ?? NO_LID;
  const ghost: GhostUniforms = createGhostUniforms(WHITE, 0);
  ghost.rim.value = 0;
  ghost.dissolve.value = 1;
  const root: Group = new Group();
  const lid: Group = new Group();
  const seam: number = Number.isFinite(hinge.seam) ? hinge.seam : 0;
  lid.position.set(0, seam, hinge.hinge);
  root.add(lid);
  const materials: MeshStandardMaterial[] = [];
  const geometries: BufferGeometry[] = [];
  const toLid: Matrix4 = new Matrix4().makeTranslation(0, -seam, -hinge.hinge);
  model.scene.updateMatrixWorld(true);
  model.scene.traverse((child: Object3D): void => {
    if (!(child instanceof Mesh)) return;
    const shape: unknown = child.geometry;
    if (!isGeometry(shape)) return;
    const source: unknown = child.material;
    if (!(source instanceof MeshStandardMaterial)) return;
    const dressed: Material = making.dresser(prop.surfaces, source);
    const material: MeshStandardMaterial = dressed instanceof MeshStandardMaterial ? dressed.clone() : source.clone();
    makeGhost(material, making.flash, ghost);
    materials.push(material);
    const placed: BufferGeometry = shape.clone().applyMatrix4(child.matrixWorld);
    const base: BufferGeometry = splitAtSeam(placed, hinge.seam, false);
    const top: BufferGeometry = splitAtSeam(placed, hinge.seam, true).applyMatrix4(toLid);
    placed.dispose();
    for (const [geometry, parent] of [[base, root], [top, lid]] as const) {
      geometry.computeBoundingSphere();
      geometries.push(geometry);
      const mesh: Mesh = new Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
  });
  const glow: GroundLight = createGroundLight(CHEST_GLOW, { kind: 'round', radius: MOMENT_CHEST.glowRadius, inner: 0, arc: Math.PI * 2 }, { fill: MOMENT_CHEST.glowFill, band: MOMENT_CHEST.glowBand, width: MOMENT_CHEST.glowWidth, wobble: MOMENT_CHEST.glowWobble });
  glow.mesh.position.set(chest.x, GROUND_LIGHT.height, chest.z);
  root.position.set(chest.x, -MOMENT_CHEST.sink, chest.z);
  root.rotation.y = (chest.rotationDegrees * Math.PI) / 180;
  root.scale.setScalar(prop.scale * MOMENT_CHEST.startScale);
  holder.add(root, glow.mesh);
  return { root, lid, ghost, materials, geometries, glow, rise: { value: 0, velocity: 0, target: 1 }, swing: { value: 0, velocity: 0, target: 0 }, scale: prop.scale, hinge, opened: 0 };
}

export function stepChest(view: ChestView, moment: ChestMoment, dt: number): void {
  const open: boolean = moment.state === 'opening' || moment.state === 'opened';
  springTo(view.swing, open ? 1 : 0);
  stepSpring(view.rise, dt);
  stepSpring(view.swing, dt);
  if (open) view.opened += dt;
  const rise: number = view.rise.value;
  view.root.position.y = (rise - 1) * MOMENT_CHEST.sink;
  view.root.scale.setScalar(view.scale * (MOMENT_CHEST.startScale + (1 - MOMENT_CHEST.startScale) * rise));
  view.lid.rotation.x = lidAngle(view.hinge, view.swing.value);
  view.ghost.dissolve.value = Math.max(moment.fade, 1 - clamp01(rise));
  const pulse: number = MOMENT_CHEST.glowClosed + MOMENT_CHEST.glowPulse * Math.sin(moment.clock * MOMENT_CHEST.glowRate);
  const burst: number = MOMENT_CHEST.glowOpen * Math.exp(-view.opened * MOMENT_CHEST.glowFall);
  view.glow.pose((open ? burst : pulse) * clamp01(rise) * (1 - moment.fade), moment.clock);
}

export function disposeChest(view: ChestView): void {
  for (const material of view.materials) material.dispose();
  for (const geometry of view.geometries) geometry.dispose();
  view.glow.dispose();
  view.root.removeFromParent();
}
