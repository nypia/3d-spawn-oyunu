import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/Rng';
import { SpatialGrid } from '../../src/sim/spatial/SpatialGrid';

describe('SpatialGrid', () => {
  it('yarıçap içindeki tüm noktaları aday olarak döner', () => {
    const rng = new Rng(9);
    const n = 500;
    const xs = new Float32Array(n);
    const zs = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = rng.range(-50, 50);
      zs[i] = rng.range(-50, 50);
    }
    const grid = new SpatialGrid(100, 4, n);
    grid.rebuild(n, xs, zs);
    const out = new Int32Array(n);
    for (let q = 0; q < 50; q++) {
      const qx = rng.range(-50, 50);
      const qz = rng.range(-50, 50);
      const r = rng.range(1, 10);
      const k = grid.query(qx, qz, r, out);
      const got = new Set(Array.from(out.subarray(0, k)));
      for (let i = 0; i < n; i++) {
        if (Math.hypot(xs[i] - qx, zs[i] - qz) <= r) expect(got.has(i)).toBe(true);
      }
    }
  });
});
