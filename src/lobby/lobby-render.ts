import type { Camera, IUniform, Object3D, Scene, ShaderMaterial, Texture, WebGLRenderer } from 'three';
import { Color, HalfFloatType, Mesh, MeshStandardMaterial, Vector2, WebGLRenderTarget } from 'three';
import type { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { QualityName } from '../mobile/quality.ts';
import { ditheredOutputPass } from '../render/output-dither.ts';

export interface LobbyBloom {
  readonly strength: number;
  readonly radius: number;
  readonly threshold: number;
}

export interface LobbyRenderTier {
  readonly pixelRatio: number;
  readonly samples: number;
  readonly anisotropy: number;
  readonly bloom: LobbyBloom | null;
}

export const LOBBY_RENDER: { readonly tiers: Readonly<Record<QualityName, LobbyRenderTier>> } = {
  tiers: {
    desktop: { pixelRatio: 2, samples: 4, anisotropy: 8, bloom: { strength: 0.42, radius: 0.72, threshold: 0.78 } },
    mobile: { pixelRatio: 1.5, samples: 4, anisotropy: 4, bloom: null },
  },
};

export function lobbyPixelRatio(name: QualityName, devicePixelRatio: number): number {
  return Math.min(LOBBY_RENDER.tiers[name].pixelRatio, devicePixelRatio > 0 ? devicePixelRatio : 1);
}

export interface LobbyPipeline {
  render(name: QualityName, devicePixelRatio: number): void;
  compile(name: QualityName): Promise<void>;
  release(): void;
}

function sharpen(material: unknown, anisotropy: number): void {
  const list: readonly unknown[] = Array.isArray(material) ? material : [material];
  for (const item of list) {
    if (!(item instanceof MeshStandardMaterial)) continue;
    const maps: (Texture | null)[] = [item.map, item.normalMap, item.roughnessMap, item.aoMap, item.metalnessMap];
    for (const map of maps) {
      if (map === null || map.anisotropy >= anisotropy) continue;
      map.anisotropy = anisotropy;
      map.needsUpdate = true;
    }
  }
}

export function sharpenTextures(root: Object3D, anisotropy: number): void {
  root.traverse((node: Object3D): void => {
    if (!(node instanceof Mesh)) return;
    const material: unknown = node.material;
    sharpen(material, anisotropy);
  });
}

const BLOOM_BLUR: { readonly across: Vector2; readonly down: Vector2 } = { across: new Vector2(1, 0), down: new Vector2(0, 1) };

const SCENE_READ: string = 'gl_FragColor = texture2D( tDiffuse, vUv );';

export function bloomOutputFragment(fragment: string): string {
  if (!fragment.includes(SCENE_READ)) throw new Error('The output shader has no scene read to add the bloom to');
  return fragment.replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse;\nuniform sampler2D tBloom;').replace(SCENE_READ, 'gl_FragColor = texture2D( tDiffuse, vUv ) + texture2D( tBloom, vUv );');
}

function uniformOf(material: ShaderMaterial, name: string): IUniform {
  const found: IUniform | undefined = material.uniforms[name];
  if (found === undefined) throw new Error(`The ${material.type} has no ${name} uniform`);
  return found;
}

interface Bloomed {
  readonly pass: UnrealBloomPass;
  readonly quad: FullScreenQuad;
  readonly bloom: IUniform;
}

function bloomOutput(output: OutputPass, bloom: LobbyBloom): Bloomed {
  output.material.fragmentShader = bloomOutputFragment(output.material.fragmentShader);
  const uniform: IUniform = { value: null };
  output.material.uniforms['tBloom'] = uniform;
  return { pass: new UnrealBloomPass(new Vector2(1, 1), bloom.strength, bloom.radius, bloom.threshold), quad: new FullScreenQuad(), bloom: uniform };
}

const keptClear: Color = new Color();

function drawQuad(renderer: WebGLRenderer, quad: FullScreenQuad, material: ShaderMaterial, target: WebGLRenderTarget): void {
  quad.material = material;
  renderer.setRenderTarget(target);
  renderer.clear();
  quad.render(renderer);
}

export function drawBloom(renderer: WebGLRenderer, bloomed: Bloomed, source: Texture): Texture {
  const pass: UnrealBloomPass = bloomed.pass;
  renderer.getClearColor(keptClear);
  const keptAlpha: number = renderer.getClearAlpha();
  const keptAuto: boolean = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setClearColor(pass.clearColor, 0);
  uniformOf(pass.materialHighPassFilter, 'tDiffuse').value = source;
  uniformOf(pass.materialHighPassFilter, 'luminosityThreshold').value = pass.threshold;
  drawQuad(renderer, bloomed.quad, pass.materialHighPassFilter, pass.renderTargetBright);
  let input: WebGLRenderTarget = pass.renderTargetBright;
  for (let mip: number = 0; mip < pass.nMips; mip += 1) {
    const blur: ShaderMaterial | undefined = pass.separableBlurMaterials[mip];
    const across: WebGLRenderTarget | undefined = pass.renderTargetsHorizontal[mip];
    const down: WebGLRenderTarget | undefined = pass.renderTargetsVertical[mip];
    if (blur === undefined || across === undefined || down === undefined) break;
    uniformOf(blur, 'colorTexture').value = input.texture;
    uniformOf(blur, 'direction').value = BLOOM_BLUR.across;
    drawQuad(renderer, bloomed.quad, blur, across);
    uniformOf(blur, 'colorTexture').value = across.texture;
    uniformOf(blur, 'direction').value = BLOOM_BLUR.down;
    drawQuad(renderer, bloomed.quad, blur, down);
    input = down;
  }
  uniformOf(pass.compositeMaterial, 'bloomStrength').value = pass.strength;
  uniformOf(pass.compositeMaterial, 'bloomRadius').value = pass.radius;
  uniformOf(pass.compositeMaterial, 'bloomTintColors').value = pass.bloomTintColors;
  const result: WebGLRenderTarget | undefined = pass.renderTargetsHorizontal[0];
  if (result === undefined) throw new Error('The bloom has no mip to composite into');
  drawQuad(renderer, bloomed.quad, pass.compositeMaterial, result);
  renderer.setClearColor(keptClear, keptAlpha);
  renderer.autoClear = keptAuto;
  return result.texture;
}

interface Built {
  readonly target: WebGLRenderTarget;
  readonly output: OutputPass;
  readonly bloomed: Bloomed | null;
  readonly samples: number;
  readonly bloom: LobbyBloom | null;
}

function build(samples: number, bloom: LobbyBloom | null): Built {
  const output: OutputPass = ditheredOutputPass();
  output.renderToScreen = true;
  return { target: new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples }), output, bloomed: bloom === null ? null : bloomOutput(output, bloom), samples, bloom };
}

function free(built: Built | null): void {
  if (built === null) return;
  built.target.dispose();
  built.output.dispose();
  built.bloomed?.pass.dispose();
  built.bloomed?.quad.dispose();
}

export function createLobbyPipeline(renderer: WebGLRenderer, scene: Scene, camera: Camera): LobbyPipeline {
  let built: Built | null = null;
  let sharpened: number = 0;
  let ratio: number = 0;
  const size: Vector2 = new Vector2();
  const drawn: Vector2 = new Vector2();

  const ready = (samples: number, bloom: LobbyBloom | null): Built => {
    if (built !== null && built.samples === samples && built.bloom === bloom) return built;
    free(built);
    drawn.set(0, 0);
    built = build(samples, bloom);
    return built;
  };

  return {
    release(): void {
      free(built);
      built = null;
      drawn.set(0, 0);
    },
    compile(name: QualityName): Promise<void> {
      const active: Built = ready(LOBBY_RENDER.tiers[name].samples, LOBBY_RENDER.tiers[name].bloom);
      const previous: WebGLRenderTarget | null = renderer.getRenderTarget();
      renderer.setRenderTarget(active.target);
      try {
        return renderer.compileAsync(scene, camera).then((): void => undefined);
      } finally {
        renderer.setRenderTarget(previous);
      }
    },
    render(name: QualityName, devicePixelRatio: number): void {
      const tier: LobbyRenderTier = LOBBY_RENDER.tiers[name];
      const limit: number = Math.min(tier.anisotropy, renderer.capabilities.getMaxAnisotropy());
      if (sharpened !== limit) {
        sharpenTextures(scene, limit);
        sharpened = limit;
      }
      const active: Built = ready(tier.samples, tier.bloom);
      const next: number = lobbyPixelRatio(name, devicePixelRatio);
      renderer.getSize(size);
      if (size.x <= 0 || size.y <= 0) return;
      if (drawn.x !== size.x || drawn.y !== size.y || ratio !== next) {
        active.target.setSize(size.x * next, size.y * next);
        active.bloomed?.pass.setSize(size.x * next, size.y * next);
        drawn.copy(size);
        ratio = next;
      }
      const previous: WebGLRenderTarget | null = renderer.getRenderTarget();
      const keptAuto: boolean = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setRenderTarget(active.target);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.autoClear = keptAuto;
      if (active.bloomed !== null) active.bloomed.bloom.value = drawBloom(renderer, active.bloomed, active.target.texture);
      active.output.render(renderer, active.target, active.target, 0, false);
      renderer.setRenderTarget(previous);
    },
  };
}
