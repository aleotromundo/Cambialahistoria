import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Object3D } from 'three';
import { Color, Mesh, Scene, ShaderMaterial } from 'three';
import type { BurstOptions, ParticleSystem } from './particles.ts';
import { createDashTrails, dashTrailKeeper } from './dash-trail.ts';

function quietParticles(bursts: BurstOptions[]): ParticleSystem {
  return {
    burst(options: BurstOptions): void {
      bursts.push(options);
    },
    update(): void {
      bursts.length = 0;
    },
    setDensity(): void {
      bursts.length = 0;
    },
    clear(): void {
      bursts.length = 0;
    },
  };
}

function trailMaterial(object: Object3D | undefined): ShaderMaterial {
  const material: unknown = object instanceof Mesh ? object.material : null;
  assert.ok(material instanceof ShaderMaterial);
  return material;
}

function programOf(material: ShaderMaterial): string {
  return [material.vertexShader, material.fragmentShader, material.transparent, material.depthWrite, material.depthTest, material.blending, material.side, JSON.stringify(material.defines)].join('|');
}

void test('the dash trail keeper is built like a live trail, so it holds the trail shader that every dash draws with', (): void => {
  const scene: Scene = new Scene();
  const trails = createDashTrails(scene, quietParticles([]));
  trails.start(1, { x: 2, z: 3 }, { x: 0, z: 1 }, new Color(0xff0000));
  const live: ShaderMaterial = trailMaterial(scene.children[0]);
  const keeper = dashTrailKeeper(new Color(0xffffff));
  assert.equal(programOf(keeper.material), programOf(live));
  const positions: unknown = keeper.geometry.getAttribute('position').array;
  const alphas: unknown = keeper.geometry.getAttribute('alpha').array;
  assert.ok(positions instanceof Float32Array && positions.every((value: number): boolean => value === 0), 'the keeper has no area to draw');
  assert.ok(alphas instanceof Float32Array && alphas.every((value: number): boolean => value === 0), 'the keeper is fully clear');
  trails.clear();
  assert.equal(scene.children.length, 0);
});
