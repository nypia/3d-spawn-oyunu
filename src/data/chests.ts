import type { Rarity } from '../sim/progression/Rarity';

/** Sandık türü: ücretli düz sandık, elitten/boss'tan/kazandan düşen ücretsiz ödül sandıkları. */
export const CHEST_PLAIN = 0;
export const CHEST_ELITE = 1;
export const CHEST_BOSS = 2;
export const CHEST_CAULDRON = 3;

export interface ChestTier {
  name: string;
  /** Çıkan eşya sayısı (her biri ayrı çark). */
  items: number;
  /** Nadirlik zarına eklenen şans. */
  luck: number;
  /** En düşük nadirlik. */
  minRarity: Rarity;
}

export const CHEST_TIERS: readonly ChestTier[] = [
  { name: 'Sandık', items: 1, luck: 0, minRarity: 0 },
  { name: 'Elit sandığı', items: 1, luck: 0.3, minRarity: 0 },
  { name: 'Boss sandığı', items: 3, luck: 0.5, minRarity: 1 },
  { name: 'Kazan sandığı', items: 1, luck: 0.5, minRarity: 0 },
];
