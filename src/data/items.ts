import type { Rarity } from '../sim/progression/Rarity';
import type { StatKey } from '../sim/stats/Stats';

/**
 * Eşyalar sandıklardan çıkar ve birikebilir (aynı eşyadan birden fazla alınabilir).
 * Sandık önce nadirlik zarı atar (Şans etkiler), sonra o kademeden bir eşya seçer.
 * Her eşyanın kendine özgü bir mekaniği var; kitaplarla çakışan saf stat eşyası yok.
 * Basit olanlar stat ekler; özel etkiler World/Weapons içindeki kancalarda uygulanır (id ile).
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
  // ---- Sıradan
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
    description: 'Altın kazancı +%30',
    stats: [{ stat: 'goldGain', mode: 'mult', value: 0.3 }],
  },
  {
    id: 'bandage',
    name: 'Bandaj',
    icon: '🩹',
    rarity: 0,
    description: 'Her seviye atlamada 15 can yenilersin',
  },
  {
    id: 'lodestone',
    name: 'Mıknatıs Taşı',
    icon: '🧲',
    rarity: 0,
    description: '40 saniyede bir 15 m içindeki XP ve altını sana çeker (her kopya daha sık)',
  },
  // ---- Nadir
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
    id: 'eye',
    name: 'Keskin Göz',
    icon: '🎯',
    rarity: 1,
    description: 'Kritik şansı +%10, kritik hasarı +%25',
    stats: [
      { stat: 'critChance', mode: 'flat', value: 0.1 },
      { stat: 'critDamage', mode: 'flat', value: 0.25 },
    ],
  },
  {
    id: 'rocket',
    name: 'Roket Çizme',
    icon: '🚀',
    rarity: 1,
    description: 'Kayma +%30; kayarken çarptığın düşmanlar hasar alır, sen almazsın',
    stats: [{ stat: 'slidePower', mode: 'mult', value: 0.3 }],
  },
  // ---- Epik
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
    id: 'frost',
    name: 'Buz Kristali',
    icon: '❄️',
    rarity: 2,
    description: 'Vuruşların %8 ihtimalle düşmanı 1,5 saniye dondurur',
  },
  {
    id: 'phoenix',
    name: 'Anka Tüyü',
    icon: '🦅',
    rarity: 2,
    description: 'Ölünce bir kez %50 canla dirilirsin, etrafa alev patlaması (tek kullanımlık)',
  },
  // ---- Efsanevi
  {
    id: 'crown',
    name: 'Lanetli Taç',
    icon: '👑',
    rarity: 3,
    description: 'Daha çok düşman gelir (+%25), ama XP ve altın +%30',
    stats: [
      { stat: 'curse', mode: 'flat', value: 0.25 },
      { stat: 'xpGain', mode: 'mult', value: 0.3 },
      { stat: 'goldGain', mode: 'mult', value: 0.3 },
    ],
  },
  {
    id: 'echo',
    name: 'Yankı Yüzüğü',
    icon: '💍',
    rarity: 3,
    description: 'Silahların %20 ihtimalle bir kez daha ateşlenir',
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
  bandageHeal: 15,
  lodestoneCooldown: 40,
  /** Her ek kopya bekleme süresini bu kadar kısaltır (en az `lodestoneMin`). */
  lodestonePerCopy: 10,
  lodestoneMin: 15,
  lodestoneRadius: 15,
  /** Roket Çizme: kayarken temas hasarı (ham, oyuncu hasar çarpanıyla ölçeklenir) ve itme. */
  rocketDamage: 25,
  rocketKnockback: 10,
  frostChance: 0.08,
  frostMaxChance: 0.3,
  frostTime: 1.5,
  phoenixHp: 0.5,
  phoenixInvuln: 2,
  phoenixRadius: 7,
  phoenixDamage: 80,
  echoChance: 0.2,
  echoMaxChance: 0.6,
  /** Yankının ilk atıştan ne kadar sonra geldiği (sn). */
  echoDelay: 0.15,
};
