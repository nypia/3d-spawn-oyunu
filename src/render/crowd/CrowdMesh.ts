import {
  type DataTexture,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  type Material,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import type { BakedClip, BakedRig } from './bakeRig';

/**
 * Animasyonlu kalabalık: bir pişmiş rig'in (bakeRig) yüzlerce kopyası tek draw call'da.
 * Instance başına `aAnim = (satırA, satırB, kesir, flaş)`; vertex shader kemik matrisini dokudan iki
 * kare okuyup ara değerle uygular. Konum/yön/boy normal `instanceMatrix`, renk tonu `instanceColor`.
 */
export class CrowdMesh extends InstancedMesh {
  readonly rig: BakedRig;
  private readonly anim: InstancedBufferAttribute;

  constructor(rig: BakedRig, capacity: number) {
    const materials = rig.materials.map((m) => patchCrowdMaterial(m.clone(), rig.texture));
    const geometry = rig.geometry.clone();
    const anim = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    anim.setUsage(DynamicDrawUsage);
    geometry.setAttribute('aAnim', anim);
    super(geometry, materials.length === 1 ? materials[0] : materials, capacity);
    this.rig = rig;
    this.anim = anim;
    this.instanceMatrix.setUsage(DynamicDrawUsage);
    this.frustumCulled = false;
    this.count = 0;
  }

  clip(name: string): BakedClip {
    const c = this.rig.clips[name];
    if (!c) throw new Error(`Pişmiş klip yok: ${name}`);
    return c;
  }

  /** i. instance'ın karesini ayarlar: `time` klip içindeki zaman (s). `flash` > 0 beyaz vuruş, < 0 buz. */
  setAnim(i: number, clip: BakedClip, time: number, flash = 0): void {
    let f = time * clip.fps;
    let a: number;
    let b: number;
    if (clip.loop) {
      f = ((f % clip.frames) + clip.frames) % clip.frames;
      a = Math.floor(f);
      b = (a + 1) % clip.frames;
    } else {
      f = Math.min(Math.max(f, 0), clip.frames - 1);
      a = Math.floor(f);
      b = Math.min(a + 1, clip.frames - 1);
    }
    const o = i * 4;
    const arr = this.anim.array as Float32Array;
    arr[o] = clip.start + a;
    arr[o + 1] = clip.start + b;
    arr[o + 2] = f - a;
    arr[o + 3] = flash;
  }

  /** Kare sonunda: çizilecek instance sayısı ve GPU güncellemesi. */
  commit(count: number): void {
    this.count = count;
    this.instanceMatrix.clearUpdateRanges();
    this.instanceMatrix.addUpdateRange(0, count * 16);
    this.instanceMatrix.needsUpdate = true;
    this.anim.clearUpdateRanges();
    this.anim.addUpdateRange(0, count * 4);
    this.anim.needsUpdate = true;
    if (this.instanceColor) {
      this.instanceColor.clearUpdateRanges();
      this.instanceColor.addUpdateRange(0, count * 3);
      this.instanceColor.needsUpdate = true;
    }
  }
}

const VERTEX_PARS = /* glsl */ `
attribute float aBone;
attribute float aGlow;
attribute vec4 aAnim;
uniform highp sampler2D crowdBones;
varying float vCrowdFlash;
varying float vCrowdGlow;
mat4 crowdBone(float row) {
  int x = int(aBone + 0.5) * 4;
  int y = int(row + 0.5);
  return mat4(
    texelFetch(crowdBones, ivec2(x, y), 0),
    texelFetch(crowdBones, ivec2(x + 1, y), 0),
    texelFetch(crowdBones, ivec2(x + 2, y), 0),
    texelFetch(crowdBones, ivec2(x + 3, y), 0)
  );
}
`;

/** Lambert (ya da benzeri) materyale kalabalık animasyonunu ve parıltı/flaşı ekler. */
export function patchCrowdMaterial<M extends Material>(mat: M, bones: DataTexture): M {
  mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.crowdBones = { value: bones };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `
        mat4 crowdM = crowdBone(aAnim.x) * (1.0 - aAnim.z) + crowdBone(aAnim.y) * aAnim.z;
        vCrowdFlash = aAnim.w;
        vCrowdGlow = aGlow;
        vec3 objectNormal = normalize(mat3(crowdM) * vec3(normal));`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = (crowdM * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vCrowdFlash;\nvarying float vCrowdGlow;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        // flaş > 0: vuruş (beyaz), < 0: donma (buz mavisi).
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vCrowdGlow * 1.3 + (vCrowdFlash > 0.0 ? vec3(vCrowdFlash) : vec3(0.04, 0.16, 0.38) * -vCrowdFlash);',
      );
  };
  // Aynı onBeforeCompile kodu farklı dokularla kullanılıyor: program önbelleği için sabit anahtar yeter
  // (doku bir uniform, programın parçası değil).
  mat.customProgramCacheKey = () => 'crowd-v1';
  return mat;
}
