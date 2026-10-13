import type { StatKey } from '../sim/stats/Stats';

/** Tapınak bonusları: nadirlik çarpanıyla ölçeklenir. */
export interface ShrineBonusDef {
  stat: StatKey;
  mode: 'flat' | 'mult';
  value: number;
  icon: string;
  describe: (v: number) => string;
}

const pct = (v: number) => Math.round(v * 100);

export const SHRINE_BONUSES: readonly ShrineBonusDef[] = [
  { stat: 'damage', mode: 'mult', value: 0.08, icon: '⚔️', describe: (v) => `Hasar +%${pct(v)}` },
  { stat: 'maxHp', mode: 'flat', value: 12, icon: '❤️', describe: (v) => `Maks can +${Math.round(v)}` },
  { stat: 'moveSpeed', mode: 'mult', value: 0.05, icon: '👟', describe: (v) => `Hareket hızı +%${pct(v)}` },
  { stat: 'attackSpeed', mode: 'mult', value: 0.06, icon: '⚡', describe: (v) => `Saldırı hızı +%${pct(v)}` },
  { stat: 'area', mode: 'mult', value: 0.06, icon: '🌀', describe: (v) => `Alan +%${pct(v)}` },
  { stat: 'critChance', mode: 'flat', value: 0.03, icon: '🎯', describe: (v) => `Kritik şansı +%${pct(v)}` },
  { stat: 'armor', mode: 'flat', value: 1, icon: '🛡️', describe: (v) => `Zırh +${Math.round(v * 10) / 10}` },
  {
    stat: 'regen',
    mode: 'flat',
    value: 0.4,
    icon: '💚',
    describe: (v) => `Can yenilenmesi +${v.toFixed(1)}/sn`,
  },
  {
    stat: 'pickupRange',
    mode: 'mult',
    value: 0.15,
    icon: '🧲',
    describe: (v) => `Toplama mesafesi +%${pct(v)}`,
  },
  { stat: 'xpGain', mode: 'mult', value: 0.06, icon: '📘', describe: (v) => `XP kazancı +%${pct(v)}` },
  { stat: 'luck', mode: 'flat', value: 0.08, icon: '🍀', describe: (v) => `Şans +${pct(v)}` },
];

export const SHRINE = {
  /** Dolum için durulması gereken yarıçap (m) ve süre (s). */
  radius: 3,
  chargeTime: 4,
  /** Dışarı çıkınca dolum bu hızla geri iner (dolumun yarı hızı). */
  decayRate: 0.5,
  choices: 3,
};
