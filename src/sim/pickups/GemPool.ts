/**
 * XP taşları.
 *  - Yakın birleştirme: yeni taş, yerde duran bir taşa çok yakın düşerse ona eklenir
 *    (kalabalıkta taş sayısı ve çizim yükü düşer, birleşen taş üst kademeye çıkar).
 *  - Taşma: havuz doluysa oyuncuya EN UZAK yerdeki taş silinir ve değeri yeni taşa eklenir.
 *    Böylece XP hiç kaybolmaz ve her öldürmede düşmanın yanında bir taş görünür.
 */
export const GEM_MERGE_RADIUS = 1;

export class GemPool {
  readonly capacity: number;
  count = 0;

  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly value: Float32Array;
  /** Mıknatısla çekilirken hız (0 = yerde duruyor). */
  readonly pull: Float32Array;
  readonly dead: Uint8Array;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.z = new Float32Array(capacity);
    this.value = new Float32Array(capacity);
    this.pull = new Float32Array(capacity);
    this.dead = new Uint8Array(capacity);
  }

  /** Toplam yerdeki XP (testler ve tanı için). */
  totalValue(): number {
    let s = 0;
    for (let i = 0; i < this.count; i++) if (!this.dead[i]) s += this.value[i];
    return s;
  }

  /**
   * (x,y,z)'ye `value` değerinde taş düşürür. (px,pz) oyuncu konumu: taşmada en uzak taşı seçmek için.
   */
  add(x: number, y: number, z: number, value: number, px: number, pz: number): void {
    // Yakındaki yerde duran taşa ekle. Son eklenenler çoğunlukla yakında olduğu için sondan tara.
    const r2 = GEM_MERGE_RADIUS * GEM_MERGE_RADIUS;
    const scan = Math.max(0, this.count - 64);
    for (let i = this.count - 1; i >= scan; i--) {
      if (this.dead[i] || this.pull[i] !== 0) continue;
      if ((this.x[i] - x) ** 2 + (this.z[i] - z) ** 2 <= r2) {
        this.value[i] += value;
        return;
      }
    }

    let v = value;
    if (this.count >= this.capacity) {
      // En uzak yerde duran taşı topla, değerini yeni taşa aktar, slotunu yeniden kullan.
      let far = -1;
      let fd = -1;
      for (let i = 0; i < this.count; i++) {
        if (this.dead[i] || this.pull[i] !== 0) continue;
        const d = (this.x[i] - px) ** 2 + (this.z[i] - pz) ** 2;
        if (d > fd) {
          fd = d;
          far = i;
        }
      }
      if (far < 0) return; // hepsi çekiliyor: çok kısa süreli, yeni taşı atla
      v += this.value[far];
      this.place(far, x, y, z, v);
      return;
    }
    this.place(this.count++, x, y, z, v);
  }

  private place(i: number, x: number, y: number, z: number, value: number): void {
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.value[i] = value;
    this.pull[i] = 0;
    this.dead[i] = 0;
  }

  removeDead(): void {
    for (let i = this.count - 1; i >= 0; i--) {
      if (!this.dead[i]) continue;
      const last = --this.count;
      if (i === last) continue;
      this.x[i] = this.x[last];
      this.y[i] = this.y[last];
      this.z[i] = this.z[last];
      this.value[i] = this.value[last];
      this.pull[i] = this.pull[last];
      this.dead[i] = this.dead[last];
    }
  }
}
