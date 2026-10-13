/**
 * Gecikmeli alan patlamaları (Havan). Önce yerde uyarı halkası görünür, süre dolunca patlar.
 * Render, halkaları `timer / total` ilerlemesiyle çizer.
 */
export class Blasts {
  readonly capacity: number;
  count = 0;
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly radius: Float32Array;
  readonly damage: Float32Array;
  readonly knockback: Float32Array;
  readonly timer: Float32Array;
  readonly total: Float32Array;

  constructor(capacity: number) {
    this.capacity = capacity;
    const f = () => new Float32Array(capacity);
    this.x = f();
    this.z = f();
    this.radius = f();
    this.damage = f();
    this.knockback = f();
    this.timer = f();
    this.total = f();
  }

  add(x: number, z: number, radius: number, damage: number, knockback: number, delay: number): void {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.x[i] = x;
    this.z[i] = z;
    this.radius[i] = radius;
    this.damage[i] = damage;
    this.knockback[i] = knockback;
    this.timer[i] = delay;
    this.total[i] = delay;
  }

  removeAt(i: number): void {
    const last = --this.count;
    if (i === last) return;
    this.x[i] = this.x[last];
    this.z[i] = this.z[last];
    this.radius[i] = this.radius[last];
    this.damage[i] = this.damage[last];
    this.knockback[i] = this.knockback[last];
    this.timer[i] = this.timer[last];
    this.total[i] = this.total[last];
  }
}
