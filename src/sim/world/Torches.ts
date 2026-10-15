/** breakFx'te meşale kırılması (Interactables türlerinden sonra gelir). */
export const TORCH_FX = 8;

/** Kırılabilir meşaleler: küçük SoA havuz, swap-remove ile silinir. */
export class Torches {
  readonly capacity: number;
  count = 0;
  readonly x: Float32Array;
  readonly z: Float32Array;
  /** Alev titremesi için faz (render). */
  readonly phase: Float32Array;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.z = new Float32Array(capacity);
    this.phase = new Float32Array(capacity);
  }

  add(x: number, z: number, phase: number): number {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    this.x[i] = x;
    this.z[i] = z;
    this.phase[i] = phase;
    return i;
  }

  removeAt(i: number): void {
    const last = --this.count;
    if (i === last) return;
    this.x[i] = this.x[last];
    this.z[i] = this.z[last];
    this.phase[i] = this.phase[last];
  }
}
