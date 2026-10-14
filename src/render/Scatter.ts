import { createNoise2D } from 'simplex-noise';
import {
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { Rng } from '../core/Rng';
import type { World } from '../sim/world/World';
import type { GameAssets } from './assets/loadAssets';
import { coloredGeometry, NATURE_PALETTE } from './assets/staticModels';
import { CulledInstances } from './CulledInstances';

const UP = new Vector3(0, 1, 0);
const m4 = new Matrix4();
const pos = new Vector3();
const quat = new Quaternion();
const tilt = new Quaternion();
const scl = new Vector3();
const nrm = new Vector3();
const normal = new Float32Array(3);
const tmp2 = new Float32Array(2);

/** Çimen tutamı: 5 ince yaprak, dipte koyu uçta açık yeşil (vertex renkli). */
function tuftGeometry(): BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const base = [0.3, 0.62, 0.2];
  const tip = [0.72, 0.92, 0.4];
  const blades = 5;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + b * 0.7;
    const r = 0.06 + (b % 2) * 0.05;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const h = 0.35 + ((b * 37) % 5) * 0.06;
    const lean = 0.12;
    const w = 0.045;
    const px = -Math.sin(a) * w;
    const pz = Math.cos(a) * w;
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + Math.cos(a) * lean, h, bz + Math.sin(a) * lean);
    col.push(...base, ...base, ...tip);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  // Normaller yukarı: ince yapraklar zeminle aynı aydınlansın (kenardan bakınca kararmasın).
  g.setAttribute(
    'normal',
    new Float32BufferAttribute(
      new Array((pos.length / 3) * 3).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  return g;
}

/** Rüzgârda hafif salınım: yaprak ucu (yükseklikle orantılı) instance konumuna göre faz kayar. */
function windMaterial(
  base: MeshLambertMaterial,
  uniforms: { uTime: { value: number } },
  amount: number,
): Material {
  base.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 wp = instanceMatrix[3].xz;
          float sway = sin(uTime * 1.6 + wp.x * 0.35 + wp.y * 0.27) + 0.5 * sin(uTime * 2.7 + wp.y * 0.5);
          transformed.x += sway * ${amount.toFixed(3)} * position.y;
          transformed.z += sway * ${(amount * 0.6).toFixed(3)} * position.y;
        #endif`,
      );
  };
  base.customProgramCacheKey = () => `wind-${amount}`;
  return base;
}

interface Layer {
  geometry: BufferGeometry;
  count: number;
  /** Ölçek aralığı. */
  scale: [number, number];
  /** Gürültü eşiği: bu değerin üstündeki çayır lekelerine yerleşir (−1..1). */
  patch: number;
  material: Material;
  /** Kümelenme: bir noktaya yakın birkaç kopya. */
  cluster?: number;
  /** Gölge alır mı (varsayılan evet). */
  shadows?: boolean;
  /** Bu mesafeden uzaktakiler çizilmez (m). */
  range: number;
}

/**
 * Bitki örtüsü serpintisi: çimen tutamları, çiçekler, mantarlar, çalılar ve kütükler.
 * Sim etkisi yok; her dünya için seed'li yerleşir. Dik yamaçlara ve engellerin içine konmaz.
 */
export class Scatter {
  readonly root = new Group();
  private readonly uniforms = { uTime: { value: 0 } };
  private readonly layers: Layer[];
  private meshes: InstancedMesh[] = [];
  private culled: CulledInstances[] = [];

  constructor(assets: GameAssets, grassCount: number) {
    const flat = () => new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // Mantar sapı krem, küçük kayalar gri.
    const nature = (k: string) =>
      coloredGeometry(assets.model(`nature/${k}`), {
        ...NATURE_PALETTE,
        _defaultMat: k.startsWith('mushroom') ? 0xf3e6d0 : 0x9a958c,
      });
    const lite = grassCount < 5000;
    this.layers = [
      {
        geometry: tuftGeometry(),
        count: grassCount,
        scale: [0.8, 1.5],
        patch: -0.35,
        material: windMaterial(
          new MeshLambertMaterial({ vertexColors: true, flatShading: true, side: DoubleSide }),
          this.uniforms,
          0.35,
        ),
        // İnce dikey yapraklar gölge haritasında leke (acne) yapıyor.
        shadows: false,
        range: lite ? 55 : 80,
      },
      ...['flower_purpleA', 'flower_redA', 'flower_yellowA', 'flower_yellowB', 'flower_redB'].map(
        (k): Layer => ({
          geometry: nature(k),
          count: lite ? 60 : 130,
          scale: [1.6, 2.2],
          patch: 0.15,
          cluster: 5,
          material: windMaterial(flat(), this.uniforms, 0.25),
          range: lite ? 70 : 100,
        }),
      ),
      ...['mushroom_red', 'mushroom_redGroup', 'mushroom_tanGroup'].map(
        (k): Layer => ({
          geometry: nature(k),
          count: lite ? 25 : 50,
          scale: [1.8, 2.6],
          patch: -0.6,
          material: flat(),
          range: lite ? 70 : 100,
        }),
      ),
      ...['plant_bush', 'plant_bushDetailed', 'plant_bushLarge', 'plant_bushSmall', 'grass_large'].map(
        (k): Layer => ({
          geometry: nature(k),
          count: lite ? 45 : 90,
          scale: [2, 3],
          patch: -0.2,
          material: flat(),
          range: lite ? 90 : 130,
        }),
      ),
      ...['stump_round', 'stump_old', 'log', 'rock_smallA', 'rock_smallC'].map(
        (k): Layer => ({
          geometry: nature(k),
          count: lite ? 15 : 30,
          scale: [2, 3],
          patch: -1,
          material: flat(),
          range: lite ? 90 : 130,
        }),
      ),
    ];
  }

  /** Yeni dünya için yerleşimi yeniden kurar. */
  build(world: World): void {
    for (const m of this.meshes) {
      this.root.remove(m);
      m.dispose();
    }
    this.meshes = [];
    this.culled = [];
    const rng = new Rng(world.seed ^ 0x5ca7);
    const noise = createNoise2D(() => rng.next());
    const terrain = world.terrain;
    const lim = terrain.playableHalf - 2;
    for (const layer of this.layers) {
      const mesh = new InstancedMesh(layer.geometry, layer.material, layer.count);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.receiveShadow = layer.shadows ?? true;
      const culled = new CulledInstances(mesh, layer.range);
      let n = 0;
      let cx = 0;
      let cz = 0;
      for (let tries = 0; tries < layer.count * 6 && n < layer.count; tries++) {
        let x: number;
        let z: number;
        if (layer.cluster && n % layer.cluster !== 0) {
          x = cx + rng.range(-1.6, 1.6);
          z = cz + rng.range(-1.6, 1.6);
        } else {
          x = rng.range(-lim, lim);
          z = rng.range(-lim, lim);
        }
        if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
        if (noise(x * 0.025, z * 0.025) < layer.patch) continue;
        terrain.normalAt(x, z, normal);
        if (normal[1] < 0.86) continue;
        world.obstacles.resolve(x, z, 0.6, tmp2);
        if (Math.abs(tmp2[0] - x) > 1e-3 || Math.abs(tmp2[1] - z) > 1e-3) continue;
        if (layer.cluster && n % layer.cluster === 0) {
          cx = x;
          cz = z;
        }
        // Zemine eğimle otur, rastgele yön ve boy.
        nrm.set(normal[0], normal[1], normal[2]);
        tilt.setFromUnitVectors(UP, nrm);
        quat.setFromAxisAngle(UP, rng.range(0, Math.PI * 2)).premultiply(tilt);
        pos.set(x, terrain.heightAt(x, z) - 0.02, z);
        const s = rng.range(layer.scale[0], layer.scale[1]);
        scl.set(s, s * rng.range(0.85, 1.15), s);
        m4.compose(pos, quat, scl);
        culled.add(m4);
        n++;
      }
      this.meshes.push(mesh);
      this.culled.push(culled);
      this.root.add(mesh);
    }
  }

  update(time: number, x: number, z: number): void {
    this.uniforms.uTime.value = time;
    for (const c of this.culled) c.cull(x, z);
  }
}
