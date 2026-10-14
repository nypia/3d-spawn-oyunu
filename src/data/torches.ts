/**
 * Meşaleler (Vampire Survivors'taki ışık kaynaklarından esinli): oyuncunun çevresinde ara ara belirir,
 * yürüyerek ya da silahla kırılır, çoğunlukla altın, bazen özel pickup düşürür.
 */
export const TORCH = {
  capacity: 16,
  /** İlk meşale run başladıktan bu kadar sn sonra, sonra her `interval` sn'de bir deneme. */
  firstDelay: 4,
  interval: 10,
  /** `nearRadius` içinde `maxNear`'dan az meşale varsa yenisi konur. */
  nearRadius: 40,
  maxNear: 6,
  minDist: 15,
  maxDist: 30,
  /** Oyuncudan bu kadar uzaklaşan meşale kaldırılır. */
  despawn: 70,
  /** Silahların çarpma yarıçapı ve oyuncunun dokunma mesafesi. */
  hitRadius: 0.6,
  touchRadius: 1.1,
  bagMin: 3,
  bagMax: 6,
  /** Saat: bu yarıçaptaki düşmanlar donar. */
  clockRadius: 40,
  clockTime: 6,
  /** Tespih: bu yarıçaptaki elit olmayanlar ölür, elitler canlarının bu oranını kaybeder. */
  rosaryRadius: 30,
  rosaryEliteFrac: 0.35,
};

export type TorchDrop = 'bag' | 'chicken' | 'magnet' | 'clock' | 'rosary';

export interface TorchDropDef {
  drop: TorchDrop;
  name: string;
  weight: number;
  /** Bu seviyeden önce düşmez. */
  minLevel: number;
  /** Nadir: Şans ağırlığını artırır, üstünde ışık sütunu olur. */
  rare: boolean;
}

export const TORCH_DROPS: readonly TorchDropDef[] = [
  { drop: 'bag', name: 'Altın kesesi', weight: 55, minLevel: 1, rare: false },
  { drop: 'chicken', name: 'Tavuk', weight: 20, minLevel: 1, rare: false },
  { drop: 'magnet', name: 'Mıknatıs', weight: 12, minLevel: 5, rare: true },
  { drop: 'clock', name: 'Saat', weight: 8, minLevel: 4, rare: true },
  { drop: 'rosary', name: 'Tespih', weight: 5, minLevel: 8, rare: true },
];

/** Seviye kapısı ve Şans'a göre ağırlıklar (nadirler × (1 + şans)). */
export function torchDropWeights(level: number, luck: number): number[] {
  return TORCH_DROPS.map((d) => (level < d.minLevel ? 0 : d.weight * (d.rare ? 1 + Math.max(0, luck) : 1)));
}
