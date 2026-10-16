import type { LoadoutEffect } from './effects';

/**
 * Kalıcı güçler (ana menüdeki dükkân): koşu sonunda kazanılan gümüşle alınır, her koşunun başında
 * uygulanır. `effects` rank başınadır (rank 3 = üç katı).
 */
export interface MetaUpgradeDef {
  id: string;
  name: string;
  icon: string;
  /** Rank başına etkinin kısa metni. */
  text: string;
  /** Sıradaki rank'in fiyatı (uzunluk = en yüksek rank). */
  costs: readonly number[];
  effects: readonly LoadoutEffect[];
}

export const META_UPGRADES: readonly MetaUpgradeDef[] = [
  {
    id: 'vigor',
    name: 'Dayanıklılık',
    icon: '❤️',
    text: '+10 maks can',
    costs: [40, 80, 130, 190, 260],
    effects: [{ stat: 'maxHp', mode: 'flat', value: 10 }],
  },
  {
    id: 'might',
    name: 'Kudret',
    icon: '⚔️',
    text: '+%5 hasar',
    costs: [60, 110, 170, 240, 320],
    effects: [{ stat: 'damage', mode: 'mult', value: 0.05 }],
  },
  {
    id: 'armor',
    name: 'Kalkan',
    icon: '🛡️',
    text: '+1 zırh',
    costs: [80, 160, 260],
    effects: [{ stat: 'armor', mode: 'flat', value: 1 }],
  },
  {
    id: 'regen',
    name: 'Yenilenme',
    icon: '💚',
    text: '+0,2 can/sn',
    costs: [60, 120, 200],
    effects: [{ stat: 'regen', mode: 'flat', value: 0.2 }],
  },
  {
    id: 'swift',
    name: 'Çeviklik',
    icon: '👟',
    text: '+%4 hareket hızı',
    costs: [50, 100, 160],
    effects: [{ stat: 'moveSpeed', mode: 'mult', value: 0.04 }],
  },
  {
    id: 'haste',
    name: 'Hiddet',
    icon: '⚡',
    text: '+%4 saldırı hızı',
    costs: [80, 150, 240],
    effects: [{ stat: 'attackSpeed', mode: 'mult', value: 0.04 }],
  },
  {
    id: 'thrust',
    name: 'İtki',
    icon: '💨',
    text: '+%10 mermi hızı ve geri itme',
    costs: [50, 100],
    effects: [
      { stat: 'projectileSpeed', mode: 'mult', value: 0.1 },
      { stat: 'knockback', mode: 'mult', value: 0.1 },
    ],
  },
  {
    id: 'magnet',
    name: 'Çekim',
    icon: '🧲',
    text: '+%10 toplama menzili',
    costs: [40, 80, 120],
    effects: [{ stat: 'pickupRange', mode: 'mult', value: 0.1 }],
  },
  {
    id: 'wisdom',
    name: 'Bilgelik',
    icon: '📘',
    text: '+%5 XP',
    costs: [70, 140, 220],
    effects: [{ stat: 'xpGain', mode: 'mult', value: 0.05 }],
  },
  {
    id: 'greed',
    name: 'Hazine',
    icon: '🪙',
    text: '+%10 altın, +15 başlangıç altını',
    costs: [50, 100, 160],
    effects: [{ stat: 'goldGain', mode: 'mult', value: 0.1 }, { gold: 15 }],
  },
  {
    id: 'fortune',
    name: 'Talih',
    icon: '🍀',
    text: '+0,05 şans',
    costs: [90, 180, 280],
    effects: [{ stat: 'luck', mode: 'flat', value: 0.05 }],
  },
  {
    id: 'reroll',
    name: 'Kader Zarı',
    icon: '🎲',
    text: '+1 yenileme hakkı',
    costs: [70, 140, 220],
    effects: [{ charge: 'rerolls', value: 1 }],
  },
  {
    id: 'exile',
    name: 'Sürgün',
    icon: '✖️',
    text: '+1 yasaklama, +1 atlama',
    costs: [90, 180],
    effects: [
      { charge: 'banishes', value: 1 },
      { charge: 'skips', value: 1 },
    ],
  },
  {
    id: 'silverGain',
    name: 'Gümüş Kesesi',
    icon: '🥈',
    text: '+%10 gümüş (koşu sonunda)',
    costs: [100, 200, 300],
    effects: [],
  },
];

export const META_UPGRADE_BY_ID: Readonly<Record<string, MetaUpgradeDef>> = Object.fromEntries(
  META_UPGRADES.map((u) => [u.id, u]),
);
