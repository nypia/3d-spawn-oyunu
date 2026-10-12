/**
 * XZ düzleminde sabit boyutlu ızgara. Her tick'te O(n) ile yeniden kurulur (counting sort),
 * sorgular sadece çevredeki hücrelere bakar. Bellek ayırma yapmaz.
 *
 * Kullanım: rebuild(n, xs, zs) → query(x, z, r, out) → out[0..k) indeksler.
 */
export class SpatialGrid {
  readonly cellSize: number;
  readonly dim: number;
  private readonly half: number;
  private readonly cellStart: Int32Array;
  private readonly cellCount: Int32Array;
  private items: Int32Array;
  private itemCell: Int32Array;

  constructor(worldSize: number, cellSize: number, capacity: number) {
    this.cellSize = cellSize;
    this.half = worldSize / 2;
    this.dim = Math.ceil(worldSize / cellSize);
    this.cellStart = new Int32Array(this.dim * this.dim + 1);
    this.cellCount = new Int32Array(this.dim * this.dim);
    this.items = new Int32Array(capacity);
    this.itemCell = new Int32Array(capacity);
  }

  private cellCoord(v: number): number {
    const c = Math.floor((v + this.half) / this.cellSize);
    return c < 0 ? 0 : c >= this.dim ? this.dim - 1 : c;
  }

  rebuild(n: number, xs: ArrayLike<number>, zs: ArrayLike<number>): void {
    if (n > this.items.length) {
      this.items = new Int32Array(n * 2);
      this.itemCell = new Int32Array(n * 2);
    }
    this.cellCount.fill(0);
    for (let i = 0; i < n; i++) {
      const c = this.cellCoord(zs[i]) * this.dim + this.cellCoord(xs[i]);
      this.itemCell[i] = c;
      this.cellCount[c]++;
    }
    let acc = 0;
    const cells = this.dim * this.dim;
    for (let c = 0; c < cells; c++) {
      this.cellStart[c] = acc;
      acc += this.cellCount[c];
    }
    this.cellStart[cells] = acc;
    // cellCount'ı yazma imleci olarak yeniden kullan.
    this.cellCount.fill(0);
    for (let i = 0; i < n; i++) {
      const c = this.itemCell[i];
      this.items[this.cellStart[c] + this.cellCount[c]++] = i;
    }
  }

  /**
   * (x,z) merkezli r yarıçaplı karenin kestiği hücrelerdeki öğeleri out'a yazar.
   * Mesafe filtresi çağıranın işidir (kaba aday listesi). Yazılan öğe sayısını döner.
   */
  query(x: number, z: number, r: number, out: Int32Array): number {
    const x0 = this.cellCoord(x - r);
    const x1 = this.cellCoord(x + r);
    const z0 = this.cellCoord(z - r);
    const z1 = this.cellCoord(z + r);
    let k = 0;
    const cap = out.length;
    for (let cz = z0; cz <= z1; cz++) {
      const row = cz * this.dim;
      for (let cx = x0; cx <= x1; cx++) {
        const c = row + cx;
        const end = this.cellStart[c] + this.cellCount[c];
        for (let p = this.cellStart[c]; p < end; p++) {
          if (k >= cap) return k;
          out[k++] = this.items[p];
        }
      }
    }
    return k;
  }
}
