import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/Rng';
import { Heightmap } from '../../src/sim/terrain/Heightmap';

const opts = { size: 64, cell: 2, wallBand: 8, spawnFlatRadius: 6 };

describe('Heightmap', () => {
  const hm = new Heightmap(new Rng(3), opts);

  it('köşe noktalarında saklanan yüksekliği döner', () => {
    for (let j = 0; j < hm.verts; j += 5) {
      for (let i = 0; i < hm.verts; i += 5) {
        const x = -hm.half + i * hm.cell;
        const z = -hm.half + j * hm.cell;
        expect(hm.heightAt(x, z)).toBeCloseTo(hm.vertexHeight(i, j), 4);
      }
    }
  });

  it('kenar ortasında iki köşenin ortalamasını döner (mesh ile aynı üçgenleme)', () => {
    const i = 10;
    const j = 12;
    const x = -hm.half + i * hm.cell;
    const z = -hm.half + j * hm.cell;
    const midX = (hm.vertexHeight(i, j) + hm.vertexHeight(i + 1, j)) / 2;
    expect(hm.heightAt(x + hm.cell / 2, z)).toBeCloseTo(midX, 4);
    const diag = (hm.vertexHeight(i, j) + hm.vertexHeight(i + 1, j + 1)) / 2;
    expect(hm.heightAt(x + hm.cell / 2, z + hm.cell / 2)).toBeCloseTo(diag, 4);
  });

  it('başlangıç alanı düz, kenarlar yüksek', () => {
    expect(Math.abs(hm.heightAt(0, 0))).toBeLessThan(0.01);
    expect(hm.heightAt(hm.half - 1, 0)).toBeGreaterThan(10);
  });

  it('normal birim uzunlukta ve yukarı bakar', () => {
    const n = [0, 0, 0];
    hm.normalAt(5, -7, n);
    expect(Math.hypot(n[0], n[1], n[2])).toBeCloseTo(1, 5);
    expect(n[1]).toBeGreaterThan(0);
  });
});
