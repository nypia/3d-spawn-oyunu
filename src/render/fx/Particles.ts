import type { Blending } from 'three';
import { SHAPE_DOT, SpriteBatch } from './Sprites';

/** Bir parçacığın doğuş ayarları (eksik alanlar varsayılan). */
export interface Emit {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  /** Ömür sonundaki boy (varsayılan: size). */
  endSize?: number;
  r: number;
  g: number;
  b: number;
  a?: number;
  /** Yerçekimi (m/s², aşağı pozitif). */
  gravity?: number;
  /** Hız sönümü (1/s). */
  drag?: number;
  shape?: number;
  stretch?: number;
}

/**
 * Havuzlu billboard parçacıklar: CPU'da basit fizik (yerçekimi, sönüm), çizim tek SpriteBatch.
 * Havuz doluysa en eski parçacığın üstüne yazılır (patlama anlarında kare düşmesin).
 */
export class Particles {
  readonly batch: SpriteBatch;
  private readonly f: Float32Array;
  private n = 0;
  private cursor = 0;
  private static readonly STRIDE = 19;

  constructor(
    readonly capacity: number,
    blending?: Blending,
  ) {
    this.batch = new SpriteBatch(capacity, blending);
    this.f = new Float32Array(capacity * Particles.STRIDE);
  }

  get mesh() {
    return this.batch.mesh;
  }

  get count(): number {
    return this.n;
  }

  clear(): void {
    this.n = 0;
    this.cursor = 0;
  }

  emit(e: Emit): void {
    let i: number;
    if (this.n < this.capacity) i = this.n++;
    else {
      i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
    }
    const f = this.f;
    const o = i * Particles.STRIDE;
    f[o] = e.x;
    f[o + 1] = e.y;
    f[o + 2] = e.z;
    f[o + 3] = e.vx ?? 0;
    f[o + 4] = e.vy ?? 0;
    f[o + 5] = e.vz ?? 0;
    f[o + 6] = 0;
    f[o + 7] = e.life;
    f[o + 8] = e.size;
    f[o + 9] = e.endSize ?? e.size;
    f[o + 10] = e.r;
    f[o + 11] = e.g;
    f[o + 12] = e.b;
    f[o + 13] = e.a ?? 1;
    f[o + 14] = e.gravity ?? 0;
    f[o + 15] = e.drag ?? 0;
    f[o + 16] = e.shape ?? SHAPE_DOT;
    f[o + 17] = e.stretch ?? 0;
    f[o + 18] = 0;
  }

  update(dt: number): void {
    const f = this.f;
    const S = Particles.STRIDE;
    const b = this.batch;
    b.begin();
    for (let i = 0; i < this.n; i++) {
      const o = i * S;
      f[o + 6] += dt;
      const u = f[o + 6] / f[o + 7];
      if (u >= 1) {
        // Son elemanı bu boşluğa taşı.
        this.n--;
        if (i !== this.n) f.copyWithin(o, this.n * S, this.n * S + S);
        if (this.cursor >= this.n) this.cursor = 0;
        i--;
        continue;
      }
      const damp = Math.max(0, 1 - f[o + 15] * dt);
      f[o + 3] *= damp;
      f[o + 4] = f[o + 4] * damp - f[o + 14] * dt;
      f[o + 5] *= damp;
      f[o] += f[o + 3] * dt;
      f[o + 1] += f[o + 4] * dt;
      f[o + 2] += f[o + 5] * dt;
      const size = f[o + 8] + (f[o + 9] - f[o + 8]) * u;
      // Hızla parlar, yavaşça söner.
      const fade = u < 0.1 ? u / 0.1 : 1 - (u - 0.1) / 0.9;
      b.push(
        f[o],
        f[o + 1],
        f[o + 2],
        size,
        f[o + 10],
        f[o + 11],
        f[o + 12],
        f[o + 13] * fade,
        f[o + 16],
        f[o + 3],
        f[o + 4],
        f[o + 5],
        f[o + 17],
      );
    }
    b.end();
  }
}
