/**
 * Sim → render tek yönlü olay akışı (ölüm efekti, vuruş sayısı vb.).
 * Sabit boyutlu halka tampon: sim yazar, render kendi imleciyle okur. Kimse okumazsa
 * (headless testler) eski olayların üzerine yazılır, bellek büyümez.
 */
export class EventRing {
  readonly data: Float32Array;
  /** Şimdiye kadar yazılan toplam olay sayısı (monoton artar). */
  written = 0;

  constructor(
    readonly capacity: number,
    readonly stride: number,
  ) {
    this.data = new Float32Array(capacity * stride);
  }

  push(a: number, b = 0, c = 0, d = 0, e = 0): void {
    const o = (this.written % this.capacity) * this.stride;
    const s = this.stride;
    this.data[o] = a;
    if (s > 1) this.data[o + 1] = b;
    if (s > 2) this.data[o + 2] = c;
    if (s > 3) this.data[o + 3] = d;
    if (s > 4) this.data[o + 4] = e;
    this.written++;
  }

  /** cursor'dan itibaren okunmamış olayları gezer; yeni imleci döner. */
  drain(cursor: number, fn: (data: Float32Array, offset: number) => void): number {
    const start = Math.max(cursor, this.written - this.capacity);
    for (let k = start; k < this.written; k++) fn(this.data, (k % this.capacity) * this.stride);
    return this.written;
  }
}
