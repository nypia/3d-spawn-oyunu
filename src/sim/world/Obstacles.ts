import type { Rng } from '../../core/Rng';
import { SpatialGrid } from '../spatial/SpatialGrid';
import type { Heightmap } from '../terrain/Heightmap';

export const OBSTACLE_TREE = 0;
export const OBSTACLE_ROCK = 1;

/** Ağaç/kaya gibi statik engeller: fizikte daire, görselde instanced model. */
export class Obstacles {
  readonly count: number;
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly radius: Float32Array;
  readonly scale: Float32Array;
  readonly rotation: Float32Array;
  readonly kind: Uint8Array;
  readonly grid: SpatialGrid;

  constructor(rng: Rng, terrain: Heightmap, trees: number, rocks: number) {
    const xs: number[] = [];
    const zs: number[] = [];
    const rs: number[] = [];
    const ss: number[] = [];
    const rots: number[] = [];
    const kinds: number[] = [];
    const n = [0.0, 0.0, 0.0];
    const limit = terrain.playableHalf - 2;

    const place = (kind: number, total: number) => {
      let placed = 0;
      for (let tries = 0; tries < total * 20 && placed < total; tries++) {
        const x = rng.range(-limit, limit);
        const z = rng.range(-limit, limit);
        if (Math.hypot(x, z) < 12) continue;
        terrain.normalAt(x, z, n);
        if (n[1] < (kind === OBSTACLE_TREE ? 0.85 : 0.7)) continue;
        const scale = kind === OBSTACLE_TREE ? rng.range(0.8, 1.5) : rng.range(0.6, 1.8);
        const r = (kind === OBSTACLE_TREE ? 0.45 : 0.9) * scale;
        let clash = false;
        for (let k = 0; k < xs.length; k++) {
          const minD = rs[k] + r + 1.2;
          if ((xs[k] - x) ** 2 + (zs[k] - z) ** 2 < minD * minD) {
            clash = true;
            break;
          }
        }
        if (clash) continue;
        xs.push(x);
        zs.push(z);
        rs.push(r);
        ss.push(scale);
        rots.push(rng.range(0, Math.PI * 2));
        kinds.push(kind);
        placed++;
      }
    };
    place(OBSTACLE_TREE, trees);
    place(OBSTACLE_ROCK, rocks);

    this.count = xs.length;
    this.x = Float32Array.from(xs);
    this.z = Float32Array.from(zs);
    this.radius = Float32Array.from(rs);
    this.scale = Float32Array.from(ss);
    this.rotation = Float32Array.from(rots);
    this.kind = Uint8Array.from(kinds);
    this.grid = new SpatialGrid(terrain.size, 6, Math.max(1, this.count));
    this.grid.rebuild(this.count, this.x, this.z);
  }

  private readonly buf = new Int32Array(64);

  /**
   * (x,z) noktasındaki r yarıçaplı daireyi engellerin dışına iter.
   * out[0], out[1] = düzeltilmiş konum.
   */
  resolve(x: number, z: number, r: number, out: Float32Array): void {
    let px = x;
    let pz = z;
    const n = this.grid.query(px, pz, r + 3, this.buf);
    for (let k = 0; k < n; k++) {
      const o = this.buf[k];
      const dx = px - this.x[o];
      const dz = pz - this.z[o];
      const minD = this.radius[o] + r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= minD * minD) continue;
      const d = Math.sqrt(d2) || 1e-4;
      px = this.x[o] + (dx / d) * minD;
      pz = this.z[o] + (dz / d) * minD;
    }
    out[0] = px;
    out[1] = pz;
  }
}
