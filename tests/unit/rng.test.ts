import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/Rng';

describe('Rng', () => {
  it('aynı seed ile aynı diziyi üretir', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('[0,1) aralığında kalır ve int uçları dahil eder', () => {
    const r = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      seen.add(r.int(1, 3));
    }
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('weightedIndex sıfır ağırlıkları asla seçmez', () => {
    const r = new Rng(1);
    for (let i = 0; i < 500; i++) expect(r.weightedIndex([0, 5, 0, 1])).not.toBe(0);
    expect(r.weightedIndex([0, 0])).toBe(-1);
  });
});
