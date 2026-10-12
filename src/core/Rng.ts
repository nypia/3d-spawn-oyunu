/**
 * Seed'li, hızlı ve deterministik RNG (mulberry32).
 * Aynı seed → aynı harita, aynı spawn'lar; testlerde ve hata ayıklamada tekrarlanabilirlik sağlar.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** [0, 1) aralığında sayı. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** [min, max] aralığında tam sayı (iki uç dahil). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Ortalama 0, std sapma 1 civarı normal dağılım (Box-Muller). */
  gaussian(): number {
    const u = Math.max(this.next(), 1e-9);
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Ağırlıklı seçim; tüm ağırlıklar 0 ise -1 döner. */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    if (total <= 0) return -1;
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i]);
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  /** Yeni bir alt-RNG (ör. harita için ayrı akış) türetir. */
  fork(): Rng {
    return new Rng(Math.floor(this.next() * 4294967296));
  }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
