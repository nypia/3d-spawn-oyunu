export const PICKUP_GOLD = 0;
export const PICKUP_HEAL = 1;
export const PICKUP_MAGNET = 2;

/**
 * XP dışındaki toplanabilirler: altın, can (tavuk budu), mıknatıs.
 * XP taşları gibi toplama mesafesine girince oyuncuya çekilir.
 */
export class PickupPool {
  readonly capacity: number;
  count = 0;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly value: Float32Array;
  readonly pull: Float32Array;
  readonly kind: Uint8Array;
  readonly dead: Uint8Array;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.z = new Float32Array(capacity);
    this.value = new Float32Array(capacity);
    this.pull = new Float32Array(capacity);
    this.kind = new Uint8Array(capacity);
    this.dead = new Uint8Array(capacity);
  }

  add(kind: number, x: number, y: number, z: number, value: number): void {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.kind[i] = kind;
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
      this.kind[i] = this.kind[last];
      this.dead[i] = this.dead[last];
    }
  }
}
