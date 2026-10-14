/**
 * XP taşı kademeleri (Vampire Survivors'tan esinli): değer büyüdükçe renk ve boy değişir.
 * Güçlü düşmanlar ve birleşen taşlar üst kademelere çıkar.
 */
export interface GemTier {
  /** Bu kademenin üst sınırı (dahil). */
  max: number;
  name: string;
  color: number;
  /** Render boy çarpanı. */
  scale: number;
}

export const GEM_TIERS: readonly GemTier[] = [
  { max: 2, name: 'Mavi', color: 0x5ad1ff, scale: 1 },
  { max: 9, name: 'Yeşil', color: 0x5dff8a, scale: 1.3 },
  { max: 49, name: 'Kırmızı', color: 0xff5a5a, scale: 1.65 },
  { max: Number.POSITIVE_INFINITY, name: 'Mor', color: 0xc77dff, scale: 2.1 },
];

export function gemTier(value: number): number {
  for (let t = 0; t < GEM_TIERS.length; t++) if (value <= GEM_TIERS[t].max) return t;
  return GEM_TIERS.length - 1;
}
