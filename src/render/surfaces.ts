import type { Material, Texture } from 'three';
import { Color, MeshStandardMaterial, NoColorSpace, RepeatWrapping, SRGBColorSpace, Vector2 } from 'three';
import type { Content, SurfaceDef, ZoneDef } from '../../sim/content/types.ts';
import { renderBudget, texturePath } from '../mobile/quality.ts';
import { shrinkTexture } from '../mobile/textures.ts';
import type { BitmapTextures } from './bitmap-texture.ts';
import { browserBitmaps, browserImageLoad, createBitmapTextures } from './bitmap-texture.ts';
import { assetUrl } from './asset-url.ts';
import { TEXTURE_SET } from './texture-set.ts';
import { PROP_SURFACE, withPropLook } from './prop-surface.ts';
import { glowingGround } from './surface-glow.ts';
import type { FloorSource } from './floor-arrays.ts';
import { floorArraySize } from './floor-arrays.ts';

export const SURFACES = {
  anisotropy: 4,
  overlayOffset: -2,
  metalFrom: 0.5,
  matteRoughness: 1,
  wetGloss: 0.62,
} as const;

export function wetRoughness(roughness: number, wet: number): number {
  return roughness * (1 - SURFACES.wetGloss * Math.min(1, Math.max(0, wet)));
}

export function matte(material: Material): Material {
  if (!(material instanceof MeshStandardMaterial) || material.metalness >= SURFACES.metalFrom) return material;
  material.roughness = Math.max(material.roughness, SURFACES.matteRoughness);
  material.roughnessMap = null;
  material.metalness = 0;
  material.metalnessMap = null;
  return material;
}

export type SurfaceUse = 'solid' | 'ground' | 'overlay';

interface Loading {
  readonly texture: Texture;
  readonly done: Promise<void>;
}

const textures: Map<string, Loading> = new Map<string, Loading>();
const bitmaps: BitmapTextures = createBitmapTextures(browserBitmaps(), browserImageLoad);
interface Made {
  readonly surface: string;
  readonly material: MeshStandardMaterial;
  readonly textures: readonly string[];
}

const materials: Map<string, Made> = new Map<string, Made>();
const surfaceTextures: Map<string, Set<string>> = new Map<string, Set<string>>();

function textureKey(path: string, metres: number): string {
  return `${path}@${metres}`;
}

function loadTexture(path: string, metres: number, colour: boolean): Texture {
  const key: string = textureKey(path, metres);
  const cached: Loading | undefined = textures.get(key);
  if (cached !== undefined) return cached.texture;
  const started: Texture[] = [];
  const done: Promise<void> = new Promise<void>((resolve: () => void): void => {
    started.push(
      bitmaps.load(
        assetUrl(texturePath(path, TEXTURE_SET.halfOnly || renderBudget().halfTextures)),
        (loaded: Texture): void => {
          shrinkTexture(loaded, renderBudget().maxTextureSize);
          resolve();
        },
        resolve,
      ),
    );
  });
  const texture: Texture | undefined = started[0];
  if (texture === undefined) throw new Error(`Texture ${path} did not start loading`);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1 / metres, 1 / metres);
  texture.anisotropy = SURFACES.anisotropy;
  texture.colorSpace = colour ? SRGBColorSpace : NoColorSpace;
  textures.set(key, { texture, done });
  return texture;
}

function surfaceTexture(def: SurfaceDef, path: string, colour: boolean): Texture {
  const owned: Set<string> = surfaceTextures.get(def.id) ?? new Set<string>();
  owned.add(textureKey(path, def.metres));
  surfaceTextures.set(def.id, owned);
  return loadTexture(path, def.metres, colour);
}

export async function floorSources(defs: readonly SurfaceDef[]): Promise<FloorSource[]> {
  const made: FloorSource[] = defs.map((def: SurfaceDef): FloorSource => ({ colour: surfaceTexture(def, def.color, true), normal: def.normal === null ? null : surfaceTexture(def, def.normal, false), orm: def.orm === null ? null : surfaceTexture(def, def.orm, false) }));
  const keys: string[] = defs.flatMap((def: SurfaceDef): string[] => [def.color, def.normal, def.orm].filter((path: string | null): path is string => path !== null).map((path: string): string => textureKey(path, def.metres)));
  await Promise.all(keys.map((key: string): Promise<void> => textures.get(key)?.done ?? Promise.resolve()));
  return made;
}

export function floorArraySizeNow(): number {
  return floorArraySize(renderBudget().halfTextures, renderBudget().maxTextureSize);
}

export function floorRoughness(def: SurfaceDef, wet: number): number {
  return wetRoughness(Math.max(def.roughness, SURFACES.matteRoughness), wet);
}

export function metalSurface(def: SurfaceDef): boolean {
  return def.metalness >= SURFACES.metalFrom;
}

export function surfaceColourMap(def: SurfaceDef): Texture {
  return surfaceTexture(def, def.color, true);
}

export function surfaceMaterial(def: SurfaceDef, use: SurfaceUse, wet: number = 0): MeshStandardMaterial {
  const key: string = wet > 0 ? `${def.id}:${use}:wet${wet}` : `${def.id}:${use}`;
  const cached: Made | undefined = materials.get(key);
  if (cached !== undefined) return cached.material;
  const orm: Texture | null = def.orm === null ? null : surfaceTexture(def, def.orm, false);
  const metal: boolean = def.metalness >= SURFACES.metalFrom;
  const made: MeshStandardMaterial = new MeshStandardMaterial({
    name: key,
    color: new Color(def.tint),
    map: surfaceTexture(def, def.color, true),
    normalMap: def.normal === null ? null : surfaceTexture(def, def.normal, false),
    normalScale: new Vector2(def.normalScale, def.normalScale),
    aoMap: orm,
    roughnessMap: metal ? orm : null,
    metalnessMap: metal ? orm : null,
    roughness: wetRoughness(metal ? def.roughness : Math.max(def.roughness, SURFACES.matteRoughness), wet),
    metalness: metal ? def.metalness : 0,
    vertexColors: use !== 'solid',
  });
  if (use !== 'solid') glowingGround(made, wet, def.glow);
  if (use === 'overlay') {
    made.transparent = true;
    made.depthWrite = false;
    made.polygonOffset = true;
    made.polygonOffsetFactor = SURFACES.overlayOffset;
    made.polygonOffsetUnits = SURFACES.overlayOffset;
  }
  const used: string[] = [def.color, def.normal, def.orm].filter((path: string | null): path is string => path !== null).map((path: string): string => textureKey(path, def.metres));
  materials.set(key, { surface: def.id, material: made, textures: used });
  return made;
}

export interface PropDressing {
  readonly wet: number;
  readonly ground: number;
}

export function propDressing(zone: ZoneDef): PropDressing {
  return { wet: zone.weather.wet, ground: zone.floorHeight };
}

export function looseDressing(zone: ZoneDef): PropDressing {
  return { wet: zone.weather.wet, ground: zone.floorHeight - PROP_SURFACE.contactHeight };
}

export function propSurfaceMaterial(def: SurfaceDef, dressing: PropDressing): MeshStandardMaterial {
  const key: string = `${def.id}:prop:${dressing.wet}:${dressing.ground}`;
  const cached: Made | undefined = materials.get(key);
  if (cached !== undefined) return cached.material;
  const made: MeshStandardMaterial = surfaceMaterial(def, 'solid').clone();
  made.name = key;
  withPropLook(made, { tileMetres: def.metres, wet: dressing.wet, ground: dressing.ground });
  const used: string[] = [def.color, def.normal, def.orm].filter((path: string | null): path is string => path !== null).map((path: string): string => textureKey(path, def.metres));
  materials.set(key, { surface: def.id, material: made, textures: used });
  return made;
}

const ownLooks: WeakMap<MeshStandardMaterial, Map<string, MeshStandardMaterial>> = new WeakMap<MeshStandardMaterial, Map<string, MeshStandardMaterial>>();

export function dressedProp(content: Content, dress: Readonly<Record<string, string>>, material: Material, dressing: PropDressing): Material {
  const surfaceId: string | undefined = dress[material.name];
  const def: SurfaceDef | undefined = surfaceId === undefined ? undefined : content.surfaces.get(surfaceId);
  if (def !== undefined) return propSurfaceMaterial(def, dressing);
  const plain: Material = matte(material);
  if (!(plain instanceof MeshStandardMaterial)) return plain;
  const key: string = `${dressing.wet}:${dressing.ground}`;
  const known: Map<string, MeshStandardMaterial> = ownLooks.get(plain) ?? new Map<string, MeshStandardMaterial>();
  ownLooks.set(plain, known);
  const cached: MeshStandardMaterial | undefined = known.get(key);
  if (cached !== undefined) return cached;
  const own: MeshStandardMaterial = withPropLook(plain.clone(), { tileMetres: null, wet: dressing.wet, ground: dressing.ground });
  known.set(key, own);
  return own;
}

export function dressed(content: Content, dress: Readonly<Record<string, string>>, material: Material, wet: number = 0): Material {
  const surfaceId: string | undefined = dress[material.name];
  const def: SurfaceDef | undefined = surfaceId === undefined ? undefined : content.surfaces.get(surfaceId);
  return def === undefined ? matte(material) : surfaceMaterial(def, 'solid', wet);
}

export async function preloadSurfaces(content: Content, ids: ReadonlySet<string>): Promise<void> {
  for (const def of content.surfaces.values()) if (ids.has(def.id)) surfaceMaterial(def, 'solid');
  await Promise.all([...textures.values()].map((loading: Loading): Promise<void> => loading.done));
}

export function keptTextureKeys(materialTextures: readonly (readonly string[])[], surfaceOwned: ReadonlyMap<string, ReadonlySet<string>>, keep: ReadonlySet<string>): Set<string> {
  const kept: Set<string> = new Set<string>(materialTextures.flat());
  for (const id of keep) for (const key of surfaceOwned.get(id) ?? []) kept.add(key);
  return kept;
}

export function releaseSurfaces(keep: ReadonlySet<string>): void {
  for (const [key, made] of materials) {
    if (keep.has(made.surface)) continue;
    made.material.dispose();
    materials.delete(key);
  }
  const used: Set<string> = keptTextureKeys([...materials.values()].map((made: Made): readonly string[] => made.textures), surfaceTextures, keep);
  for (const id of surfaceTextures.keys()) if (!keep.has(id)) surfaceTextures.delete(id);
  for (const [key, loading] of textures) {
    if (used.has(key)) continue;
    loading.texture.dispose();
    textures.delete(key);
  }
}
