import type { StatKey } from '../sim/stats/Stats';
import type { WorldMods } from '../sim/world/World';

/** Paktın bir etkisi: oyuncu stat'ı (taban + / çarpan) ya da dünya çarpanı (düşmanlar, iyileşme). */
export type PactEffect =
  | { stat: StatKey; mode: 'flat' | 'mult'; value: number }
  | { mod: keyof WorldMods; mult: number };

/** Lanet Sunağı paktı: bir güç ve kalıcı bir lanet. */
export interface PactDef {
  id: string;
  name: string;
  icon: string;
  boon: PactEffect[];
  bane: PactEffect[];
  boonText: string;
  baneText: string;
}

export const PACTS: readonly PactDef[] = [
  {
    id: 'bloodPrice',
    name: 'Kan Bedeli',
    icon: '🩸',
    boon: [{ stat: 'damage', mode: 'mult', value: 0.25 }],
    bane: [{ stat: 'maxHp', mode: 'mult', value: -0.2 }],
    boonText: 'Hasar +%25',
    baneText: 'Maks can −%20',
  },
  {
    id: 'glassHeart',
    name: 'Cam Kalp',
    icon: '💎',
    boon: [
      { stat: 'critChance', mode: 'flat', value: 0.12 },
      { stat: 'critDamage', mode: 'flat', value: 0.5 },
    ],
    bane: [{ mod: 'damageTaken', mult: 1.25 }],
    boonText: 'Kritik şansı +%12, kritik hasarı +%50',
    baneText: 'Aldığın hasar +%25',
  },
  {
    id: 'greed',
    name: 'Açgözlülük',
    icon: '💰',
    boon: [
      { stat: 'goldGain', mode: 'mult', value: 0.6 },
      { stat: 'luck', mode: 'flat', value: 0.15 },
    ],
    bane: [{ mod: 'enemyHp', mult: 1.15 }],
    boonText: 'Altın +%60, şans +15',
    baneText: 'Düşman canı +%15',
  },
  {
    id: 'crowdCall',
    name: 'Kalabalık Çağrısı',
    icon: '📯',
    boon: [{ stat: 'xpGain', mode: 'mult', value: 0.35 }],
    bane: [{ stat: 'curse', mode: 'flat', value: 0.35 }],
    boonText: 'XP kazancı +%35',
    baneText: 'Daha çok düşman gelir (+%35)',
  },
  {
    id: 'windOath',
    name: 'Rüzgâr Yemini',
    icon: '🌪️',
    boon: [
      { stat: 'moveSpeed', mode: 'mult', value: 0.18 },
      { stat: 'jumpCount', mode: 'flat', value: 1 },
    ],
    bane: [{ mod: 'enemySpeed', mult: 1.1 }],
    boonText: 'Hız +%18, +1 zıplama',
    baneText: 'Düşmanlar %10 hızlı',
  },
  {
    id: 'ironSkin',
    name: 'Demir Deri',
    icon: '🛡️',
    boon: [
      { stat: 'armor', mode: 'flat', value: 8 },
      { stat: 'maxHp', mode: 'flat', value: 40 },
    ],
    bane: [{ stat: 'moveSpeed', mode: 'mult', value: -0.12 }],
    boonText: 'Zırh +8, maks can +40',
    baneText: 'Hız −%12',
  },
  {
    id: 'stormOath',
    name: 'Fırtına Andı',
    icon: '⛈️',
    boon: [{ stat: 'attackSpeed', mode: 'mult', value: 0.22 }],
    bane: [{ mod: 'enemyDamage', mult: 1.2 }],
    boonText: 'Saldırı hızı +%22',
    baneText: 'Düşman hasarı +%20',
  },
  {
    id: 'deathRing',
    name: 'Ölüm Halkası',
    icon: '💀',
    boon: [
      { stat: 'area', mode: 'mult', value: 0.25 },
      { stat: 'duration', mode: 'mult', value: 0.15 },
    ],
    bane: [{ mod: 'healing', mult: 0.6 }],
    boonText: 'Alan +%25, süre +%15',
    baneText: 'İyileşme −%40',
  },
];
