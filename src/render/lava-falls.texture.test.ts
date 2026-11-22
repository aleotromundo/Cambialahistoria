import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Texture } from 'three';
import type { ShaderMaterial } from 'three';
import { loadContent } from '../../sim/content/content.ts';
import type { SurfaceDef, SurfaceGlow } from '../../sim/content/types.ts';
import { fallMaterial } from './lava-falls.ts';

void test('a fall samples the surface texture itself, so leaving the zone frees it from the GPU', (): void => {
  const def: SurfaceDef | undefined = loadContent().surfaces.get('molten');
  const glow: SurfaceGlow | null = def?.glow ?? null;
  assert.ok(def !== undefined && glow !== null);
  const map: Texture = new Texture();
  const material: ShaderMaterial = fallMaterial(def, glow, map);
  assert.equal(material.uniforms['uMap']?.value, map);
  material.dispose();
});
