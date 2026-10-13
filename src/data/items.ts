import type { Rarity } from '../sim/progression/Rarity';
import type { StatKey } from '../sim/stats/Stats';

/**
 * Eşyalar sandıklardan çıkar, birikebilir (aynı eşyadan birden fazla alınabilir).
 * Basit olanlar stat ekler; özel etkiler World içindeki kancalarda uygulanır (id ile).
 */
export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  /** Sandıktan çıkma kademesi. */
  rarity: Rarity;
  description: string;
  stats?: readonly { stat: StatKey; mode: 'flat' | 'mult'; value: number }[];
}

export const ITEMS: readonly ItemDef[] = [
  {
    id: 'feather',
    name: 'Tüy',
    icon: '🪶',
    rarity: 0,
    description: '+1 zıplama hakkı (havada tekrar zıpla)',
    stats: [{ stat: 'jumpCount', mode: 'flat', value: 1 }],
  },
  {
    id: 'coin',
    name: 'Altın Sikke',
    icon: '🪙',
    rarity: 0,
    description: 'Altın kazancı +%25',
    stats: [{ stat: 'goldGain', mode: 'mult', value: 0.25 }],
  },
  {
    id: 'hourglass',
    name: 'Kum Saati',
    icon: '⏳',
    rarity: 0,
    description: 'Mermi ve efekt süresi +%15',
    stats: [{ stat: 'duration', mode: 'mult', value: 0.15 }],
  },
  {
    id: 'boots',
    name: 'Çizme',
    icon: '🥾',
    rarity: 0,
    description: 'Hareket hızı +%8, kayma hızı +%25',
    stats: [
      { stat: 'moveSpeed', mode: 'mult', value: 0.08 },
      { stat: 'slidePower', mode: 'mult', value: 0.25 },
    ],
  },
  {
    id: 'fang',
    name: 'Vampir Dişi',
    icon: '🦷',
    rarity: 1,
    description: 'Öldürdüğün her düşman %8 ihtimalle 2 can verir',
  },
  {
    id: 'thorns',
    name: 'Dikenli Zırh',
    icon: '🌵',
    rarity: 1,
    description: '+2 zırh; sana dokunan düşman aldığın hasarın 3 katını yer',
    stats: [{ stat: 'armor', mode: 'flat', value: 2 }],
  },
  {
    id: 'clover',
    name: 'Yonca',
    icon: '☘️',
    rarity: 1,
    description: 'Şans +20',
    stats: [{ stat: 'luck', mode: 'flat', value: 0.2 }],
  },
  {
    id: 'amulet',
    name: 'Kalkan Muskası',
    icon: '🧿',
    rarity: 2,
    description: '12 saniyede bir gelen ilk vuruşu tamamen engeller (her kopya −2 sn)',
  },
  {
    id: 'skull',
    name: 'Patlayan Kafatası',
    icon: '💀',
    rarity: 2,
    description: 'Öldürdüğün düşman %10 ihtimalle patlayıp çevresine hasar verir',
  },
  {
    id: 'crown',
    name: 'Lanetli Taç',
    icon: '👑',
    rarity: 3,
    description: 'Daha çok düşman gelir (+%20), ama XP ve altın +%20',
    stats: [
      { stat: 'curse', mode: 'flat', value: 0.2 },
      { stat: 'xpGain', mode: 'mult', value: 0.2 },
      { stat: 'goldGain', mode: 'mult', value: 0.2 },
    ],
  },
];

export const ITEM_INDEX: Record<string, number> = Object.fromEntries(ITEMS.map((t, i) => [t.id, i]));

/** Eşya kancalarının ayarları. */
export const ITEM_FX = {
  fangChance: 0.08,
  fangHeal: 2,
  thornsMult: 3,
  amuletCooldown: 12,
  amuletPerCopy: 2,
  amuletMin: 6,
  skullChance: 0.1,
  skullRadius: 3,
  skullDamage: 20,
};
