import type { Rng } from '../../core/Rng';

/** 0 Sıradan · 1 Nadir · 2 Epik · 3 Efsanevi */
export type Rarity = 0 | 1 | 2 | 3;

export interface RarityDef {
  name: string;
  /** Bonusun büyüklük çarpanı. */
  mult: number;
  /** Şans 0 iken seçilme ağırlığı. */
  weight: number;
}

export const RARITIES: readonly RarityDef[] = [
  { name: 'Sıradan', mult: 1, weight: 60 },
  { name: 'Nadir', mult: 1.5, weight: 25 },
  { name: 'Epik', mult: 2, weight: 11 },
  { name: 'Efsanevi', mult: 3, weight: 4 },
];

/**
 * Şans, üst nadirliklerin ağırlığını doğrusal artırır:
 *   ağırlık_i × (1 + şans × i)
 * Örn. şans 0.5 → Nadir ×1.5, Epik ×2, Efsanevi ×2.5.
 */
export function rarityWeights(luck: number): number[] {
  const l = Math.max(0, luck);
  return RARITIES.map((r, i) => r.weight * (1 + l * i));
}

export function rollRarity(rng: Rng, luck: number): Rarity {
  return Math.max(0, rng.weightedIndex(rarityWeights(luck))) as Rarity;
}

export function rarityMult(r: Rarity): number {
  return RARITIES[r].mult;
}
