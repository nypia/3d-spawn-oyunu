import { createNoise2D } from 'simplex-noise';
import type { Rng } from '../../core/Rng';

export interface HeightmapOptions {
  size: number;
  cell: number;
  wallBand: number;
  spawnFlatRadius: number;
}

/**
 * Prosedürel yükseklik haritası. Hem render mesh'i hem de fizik (yer yüksekliği, eğim) aynı
 * ızgaradan ve AYNI üçgenlemeden beslenir; böylece karakter görünen zemine tam oturur.
 *
 * Hücre üçgenlemesi: (i,j)-(i,j+1)-(i+1,j+1) ve (i,j)-(i+1,j+1)-(i+1,j)
 * yani köşegen (i,j) → (i+1,j+1) yönündedir.
 */
export class Heightmap {
  readonly size: number;
  readonly cell: number;
  /** Bir kenardaki köşe (vertex) sayısı. */
  readonly verts: number;
  readonly half: number;
  readonly heights: Float32Array;
  /** Oyuncunun/düşmanların gidebileceği iç sınır (duvar bandının içi). */
  readonly playableHalf: number;

  constructor(rng: Rng, opts: HeightmapOptions) {
    this.size = opts.size;
    this.cell = opts.cell;
    this.half = opts.size / 2;
    this.verts = Math.round(opts.size / opts.cell) + 1;
    this.heights = new Float32Array(this.verts * this.verts);
    this.playableHalf = this.half - opts.wallBand * 0.6;

    const noise = createNoise2D(() => rng.next());
    const ridge = createNoise2D(() => rng.next());

    for (let j = 0; j < this.verts; j++) {
      for (let i = 0; i < this.verts; i++) {
        const x = -this.half + i * this.cell;
        const z = -this.half + j * this.cell;

        // Geniş tepeler + orta ölçek engebe + ince detay (fBm).
        let h = 0;
        h += noise(x * 0.008, z * 0.008) * 7;
        h += noise(x * 0.022 + 31.7, z * 0.022 - 11.3) * 2.6;
        h += noise(x * 0.06 - 5.1, z * 0.06 + 9.9) * 0.6;
        // Ara sıra keskin sırtlar: kayma ve zıplama için rampa hissi.
        const r = 1 - Math.abs(ridge(x * 0.012, z * 0.012));
        h += r * r * r * 4;

        // Başlangıç alanını yumuşakça düzleştir.
        const d = Math.hypot(x, z);
        const flat = smoothstep(opts.spawnFlatRadius, opts.spawnFlatRadius * 2.2, d);
        h *= flat;

        // Kenarlarda yükselen duvar (doğal sınır).
        const edge = Math.max(Math.abs(x), Math.abs(z));
        const w = smoothstep(this.half - opts.wallBand, this.half, edge);
        h += w * w * 22;

        this.heights[j * this.verts + i] = h;
      }
    }
  }

  vertexHeight(i: number, j: number): number {
    const v = this.verts - 1;
    const ci = i < 0 ? 0 : i > v ? v : i;
    const cj = j < 0 ? 0 : j > v ? v : j;
    return this.heights[cj * this.verts + ci];
  }

  /** Dünya koordinatında zemin yüksekliği (mesh ile birebir aynı üçgen enterpolasyonu). */
  heightAt(x: number, z: number): number {
    const gx = (x + this.half) / this.cell;
    const gz = (z + this.half) / this.cell;
    const max = this.verts - 1 - 1e-6;
    const cx = gx < 0 ? 0 : gx > max ? max : gx;
    const cz = gz < 0 ? 0 : gz > max ? max : gz;
    const i = Math.floor(cx);
    const j = Math.floor(cz);
    const fx = cx - i;
    const fz = cz - j;
    const h00 = this.heights[j * this.verts + i];
    const h10 = this.heights[j * this.verts + i + 1];
    const h01 = this.heights[(j + 1) * this.verts + i];
    const h11 = this.heights[(j + 1) * this.verts + i + 1];
    if (fz >= fx) return h00 + (h11 - h01) * fx + (h01 - h00) * fz;
    return h00 + (h10 - h00) * fx + (h11 - h10) * fz;
  }

  /** Zemin normali (merkezi farklar ile, yumuşak). out = [nx, ny, nz] */
  normalAt(x: number, z: number, out: Float32Array | number[]): void {
    const e = this.cell * 0.5;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    const nx = -dx;
    const ny = 2 * e;
    const nz = -dz;
    const len = Math.hypot(nx, ny, nz);
    out[0] = nx / len;
    out[1] = ny / len;
    out[2] = nz / len;
  }

  clampToPlayable(v: number): number {
    const p = this.playableHalf;
    return v < -p ? -p : v > p ? p : v;
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
