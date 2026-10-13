import type { StatKey } from '../sim/stats/Stats';

/** Kitap = pasif stat yükseltmesi. Her seviye aynı bonusu tekrar ekler. */
export interface TomeDef {
  id: string;
  name: string;
  icon: string;
  stat: StatKey;
  /** 'mult' → (1 + Σmult) çarpanına eklenir; 'flat' → tabana eklenir. */
  mode: 'mult' | 'flat';
  perLevel: number;
  maxLevel: number;
  /** Seviye atlama havuzundaki ağırlık. */
  weight: number;
  /** Tam sayı stat (mermi sayısı gibi): nadirlik çarpanı aşağı yuvarlanır, en az 1. */
  integer?: boolean;
  describe: (perLevel: number) => string;
}

const pct = (v: number) => `${Math.round(v * 100)}`;

export const TOMES: readonly TomeDef[] = [
  {
    id: 'power',
    name: 'Güç Kitabı',
    icon: '⚔️',
    stat: 'damage',
    mode: 'mult',
    perLevel: 0.15,
    maxLevel: 5,
    weight: 10,
    describe: (v) => `Tüm hasar +%${pct(v)}`,
  },
  {
    id: 'agility',
    name: 'Çeviklik Kitabı',
    icon: '👟',
    stat: 'moveSpeed',
    mode: 'mult',
    perLevel: 0.1,
    maxLevel: 5,
    weight: 8,
    describe: (v) => `Hareket hızı +%${pct(v)}`,
  },
  {
    id: 'fury',
    name: 'Hiddet Kitabı',
    icon: '⚡',
    stat: 'attackSpeed',
    mode: 'mult',
    perLevel: 0.12,
    maxLevel: 5,
    weight: 9,
    describe: (v) => `Saldırı hızı +%${pct(v)}`,
  },
  {
    id: 'vitality',
    name: 'Can Kitabı',
    icon: '❤️',
    stat: 'maxHp',
    mode: 'flat',
    perLevel: 20,
    maxLevel: 5,
    weight: 8,
    describe: (v) => `Maks can +${Math.round(v)} (ve iyileştirir)`,
  },
  {
    id: 'magnet',
    name: 'Mıknatıs Kitabı',
    icon: '🧲',
    stat: 'pickupRange',
    mode: 'mult',
    perLevel: 0.3,
    maxLevel: 5,
    weight: 6,
    describe: (v) => `Toplama mesafesi +%${pct(v)}`,
  },
  {
    id: 'breadth',
    name: 'Genişlik Kitabı',
    icon: '🌀',
    stat: 'area',
    mode: 'mult',
    perLevel: 0.12,
    maxLevel: 5,
    weight: 7,
    describe: (v) => `Alan +%${pct(v)}`,
  },
  {
    id: 'multiply',
    name: 'Çoğaltma Kitabı',
    icon: '➕',
    stat: 'projectileCount',
    mode: 'flat',
    perLevel: 1,
    maxLevel: 3,
    weight: 3,
    integer: true,
    describe: (v) => `Tüm silahlar +${v} mermi`,
  },
  {
    id: 'luck',
    name: 'Şans Kitabı',
    icon: '🍀',
    stat: 'luck',
    mode: 'flat',
    perLevel: 0.15,
    maxLevel: 5,
    weight: 6,
    describe: (v) => `Şans +${Math.round(v * 100)}: nadir kartlar ve eşyalar daha sık`,
  },
];

/** Kitabın bu nadirlikteki bir seviyesinin getirdiği değer. */
export function tomeValue(def: TomeDef, mult: number): number {
  return def.integer ? Math.max(1, Math.floor(def.perLevel * mult)) : def.perLevel * mult;
}

export const TOME_INDEX: Record<string, number> = Object.fromEntries(TOMES.map((t, i) => [t.id, i]));
