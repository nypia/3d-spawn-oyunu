/** XP taşları. Havuz dolarsa yeni taşın değeri mevcut bir taşa eklenir (birleştirme). */
export class GemPool {
  readonly capacity: number;
  count = 0;
  private mergeCursor = 0;

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

  add(x: number, y: number, z: number, value: number): void {
    if (this.count >= this.capacity) {
      // Yerde duran (çekilmeyen) bir taşa ekle.
      for (let tries = 0; tries < this.count; tries++) {
        const i = this.mergeCursor;
        this.mergeCursor = (this.mergeCursor + 1) % this.count;
        if (!this.dead[i] && this.pull[i] === 0) {
          this.value[i] += value;
          return;
        }
      }
      return;
    }
    const i = this.count++;
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
    if (this.mergeCursor >= this.count) this.mergeCursor = 0;
  }
}
