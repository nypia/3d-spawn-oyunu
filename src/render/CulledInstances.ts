import type { InstancedMesh, Matrix4 } from 'three';

/**
 * Haritaya dağılmış statik instance'lar (ağaç, kaya, çimen) için mesafe kırpma. Tüm matrisler burada
 * saklanır; GPU'ya yalnızca oyuncuya `radius` içindekiler yüklenir. Oyuncu `radius`'un küçük bir kısmı
 * kadar yer değiştirince yeniden kırpılır (her kare değil). Sis zaten uzağı gizliyor.
 */
export class CulledInstances {
  private readonly matrices: Float32Array;
  private readonly xz: Float32Array;
  private n = 0;
  private lastX = Number.POSITIVE_INFINITY;
  private lastZ = Number.POSITIVE_INFINITY;

  constructor(
    readonly mesh: InstancedMesh,
    readonly radius: number,
  ) {
    const cap = mesh.instanceMatrix.count;
    this.matrices = new Float32Array(cap * 16);
    this.xz = new Float32Array(cap * 2);
    mesh.count = 0;
    // Tek bir sınır küresi tüm haritayı kapsar; kırpmayı biz yapıyoruz.
    mesh.frustumCulled = false;
  }

  get size(): number {
    return this.n;
  }

  add(m: Matrix4): boolean {
    if (this.n * 16 >= this.matrices.length) return false;
    m.toArray(this.matrices, this.n * 16);
    this.xz[this.n * 2] = m.elements[12];
    this.xz[this.n * 2 + 1] = m.elements[14];
    this.n++;
    this.lastX = Number.POSITIVE_INFINITY;
    return true;
  }

  /** (x,z) çevresindekileri yükler; `force` yoksa yalnızca yeterince yer değiştirildiyse. */
  cull(x: number, z: number, force = false): void {
    const moved = (x - this.lastX) ** 2 + (z - this.lastZ) ** 2;
    if (!force && moved < (this.radius * 0.12) ** 2) return;
    this.lastX = x;
    this.lastZ = z;
    const out = this.mesh.instanceMatrix.array as Float32Array;
    const r2 = this.radius * this.radius;
    let k = 0;
    for (let i = 0; i < this.n; i++) {
      const dx = this.xz[i * 2] - x;
      const dz = this.xz[i * 2 + 1] - z;
      if (dx * dx + dz * dz > r2) continue;
      out.set(this.matrices.subarray(i * 16, i * 16 + 16), k * 16);
      k++;
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.clearUpdateRanges();
    this.mesh.instanceMatrix.addUpdateRange(0, k * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
