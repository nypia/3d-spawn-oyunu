import type { Rng } from '../../core/Rng';
import { CHEST_PLAIN } from '../../data/chests';
import type { Heightmap } from '../terrain/Heightmap';
import type { Obstacles } from './Obstacles';

export const VASE = 0;
export const CHEST = 1;
export const SHRINE = 2;

/**
 * Haritadaki etkileşimli nesneler: kırılabilir vazolar, sandıklar ve tapınaklar.
 * Sayıları az (~100) olduğu için düz diziler yeterli; her tick doğrusal taranır.
 */
export class Interactables {
  readonly capacity: number;
  count = 0;
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly kind: Uint8Array;
  /** 0 = kullanılabilir, 1 = kullanıldı (kırıldı / açıldı / doldu). */
  readonly used: Uint8Array;
  /** Sandık: elitten/boss'tan/kazandan düşen ücretsiz ödül sandığı. */
  readonly free: Uint8Array;
  /** Sandık türü (CHEST_*: düz, elit, boss, kazan). */
  readonly tier: Uint8Array;
  /** Tapınak dolum ilerlemesi (0..1). */
  readonly charge: Float32Array;
  readonly rotation: Float32Array;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.z = new Float32Array(capacity);
    this.kind = new Uint8Array(capacity);
    this.used = new Uint8Array(capacity);
    this.free = new Uint8Array(capacity);
    this.tier = new Uint8Array(capacity);
    this.charge = new Float32Array(capacity);
    this.rotation = new Float32Array(capacity);
  }

  add(kind: number, x: number, z: number, rotation = 0, free = false): number {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    this.kind[i] = kind;
    this.x[i] = x;
    this.z[i] = z;
    this.used[i] = 0;
    this.free[i] = free ? 1 : 0;
    this.tier[i] = CHEST_PLAIN;
    this.charge[i] = 0;
    this.rotation[i] = rotation;
    return i;
  }

  /**
   * Ücretsiz ödül sandığı bırakır. Açılmış ücretsiz sandıkların yuvaları yeniden kullanılır
   * (sonsuz koşuda havuz dolmasın).
   */
  addRewardChest(x: number, z: number, rotation: number, tier: number): number {
    let i = -1;
    for (let k = 0; k < this.count; k++) {
      if (this.kind[k] === CHEST && this.used[k] && this.free[k]) {
        i = k;
        break;
      }
    }
    if (i < 0) i = this.add(CHEST, x, z, rotation, true);
    if (i < 0) return -1;
    this.x[i] = x;
    this.z[i] = z;
    this.rotation[i] = rotation;
    this.used[i] = 0;
    this.free[i] = 1;
    this.tier[i] = tier;
    return i;
  }

  /**
   * Haritaya seed'li yerleşim: düz zemin, engellerden ve birbirinden uzak, başlangıçtan en az 12 m.
   * Vazolar 2–3'lü küçük gruplar halinde.
   */
  populate(
    rng: Rng,
    terrain: Heightmap,
    obstacles: Obstacles,
    chests: number,
    shrines: number,
    vaseGroups: number,
  ): void {
    const limit = terrain.playableHalf - 4;
    const n = [0, 0, 0];
    const tmp = new Float32Array(2);
    const ok = (x: number, z: number, clearance: number, minCenter: number) => {
      if (Math.hypot(x, z) < minCenter) return false;
      terrain.normalAt(x, z, n);
      if (n[1] < 0.88) return false;
      obstacles.resolve(x, z, clearance, tmp);
      // tmp Float32: birebir eşitlik yerine küçük tolerans (engel itmediyse yer serbest).
      if (Math.abs(tmp[0] - x) > 1e-3 || Math.abs(tmp[1] - z) > 1e-3) return false;
      for (let k = 0; k < this.count; k++) {
        const d = this.kind[k] === VASE ? 1.5 : 6;
        if ((this.x[k] - x) ** 2 + (this.z[k] - z) ** 2 < (clearance + d) ** 2) return false;
      }
      return true;
    };
    const place = (kind: number, total: number, clearance: number, minCenter: number) => {
      let placed = 0;
      for (let tries = 0; tries < total * 40 && placed < total; tries++) {
        const x = rng.range(-limit, limit);
        const z = rng.range(-limit, limit);
        if (!ok(x, z, clearance, minCenter)) continue;
        this.add(kind, x, z, rng.range(0, Math.PI * 2));
        placed++;
      }
    };
    place(SHRINE, shrines, 3, 25);
    place(CHEST, chests, 1.5, 14);
    let groups = 0;
    for (let tries = 0; tries < vaseGroups * 40 && groups < vaseGroups; tries++) {
      const cx = rng.range(-limit, limit);
      const cz = rng.range(-limit, limit);
      if (!ok(cx, cz, 2, 10)) continue;
      const size = rng.int(2, 3);
      for (let v = 0; v < size; v++) {
        const a = rng.range(0, Math.PI * 2);
        this.add(VASE, cx + Math.sin(a) * 0.9 * v, cz + Math.cos(a) * 0.9 * v, rng.range(0, Math.PI * 2));
      }
      groups++;
    }
  }
}
