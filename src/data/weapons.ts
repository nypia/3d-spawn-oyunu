/**
 * Silah = veri + davranış. Davranış kodu sim/weapons/Weapons.ts içinde; burada sadece sayılar.
 * Seviye 1 = base; her yükseltme `levels[i]` deltasını kartın nadirlik çarpanıyla uygular.
 * Kart açıklaması deltadan otomatik üretilir (describeDelta).
 */
export type WeaponBehavior =
  | 'homingBolt'
  | 'aura'
  | 'arc'
  | 'orbit'
  | 'boomerang'
  | 'chain'
  | 'mortar'
  | 'cone';

export interface WeaponStats {
  damage: number;
  /** Saniye cinsinden bekleme (aura için hasar tick aralığı). */
  cooldown: number;
  /** Atış başına mermi sayısı. */
  count: number;
  /** m/s */
  speed: number;
  /**
   * Silaha göre: mermi yarıçapı, aura/kılıç menzili, yörünge yarıçapı,
   * şimşek sekme mesafesi ya da havan patlama yarıçapı (m).
   */
  area: number;
  /** Mermi ömrü ya da havan gecikmesi (s). */
  duration: number;
  /** Kaç düşmanı delip geçer. */
  pierce: number;
  knockback: number;
}

/**
 * Bir seviye yükseltmesinin getirdikleri. Kesirli alanlar nadirlik çarpanıyla büyür;
 * tam sayı alanlar (count, pierce) büyümez.
 */
export interface WeaponLevelDelta {
  /** Mutlak hasar artışı. */
  damage?: number;
  /** Bekleme süresi azalması (0.15 = −%15). */
  cooldownPct?: number;
  /** Alan artışı, taban alana oranla (0.2 = +%20). */
  areaPct?: number;
  /** Süre artışı, tabana oranla. */
  durationPct?: number;
  count?: number;
  pierce?: number;
}

export interface WeaponDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  behavior: WeaponBehavior;
  base: WeaponStats;
  levels: readonly WeaponLevelDelta[];
  /** Evrimleşmiş silah: hangi temel silahtan geldiği (yuva ve "sahip olunan" kontrolü için). */
  evolvesFrom?: string;
  /** Evrimleşmiş silahın efekt rengi. */
  tint?: number;
}

export const WEAPONS: readonly WeaponDef[] = [
  {
    id: 'magicBolt',
    name: 'Büyü Oku',
    icon: '✨',
    description: 'En yakın düşmana hedef takip eden büyü mermisi fırlatır.',
    behavior: 'homingBolt',
    base: {
      damage: 12,
      cooldown: 0.85,
      count: 1,
      speed: 19,
      area: 0.35,
      duration: 2.2,
      pierce: 1,
      knockback: 2.5,
    },
    levels: [
      { count: 1 },
      { damage: 6 },
      { cooldownPct: 0.15 },
      { count: 1 },
      { pierce: 1, damage: 5 },
      { count: 1 },
      { damage: 10, cooldownPct: 0.1 },
    ],
  },
  {
    id: 'fireAura',
    name: 'Ateş Halesi',
    icon: '🔥',
    description: 'Etrafındaki düşmanları sürekli yakan bir hale.',
    behavior: 'aura',
    base: {
      damage: 6,
      cooldown: 0.55,
      count: 0,
      speed: 0,
      area: 2.8,
      duration: 0,
      pierce: 0,
      knockback: 0.6,
    },
    levels: [
      { areaPct: 0.2 },
      { damage: 4 },
      { cooldownPct: 0.15 },
      { areaPct: 0.2, damage: 3 },
      { damage: 6 },
      { areaPct: 0.25 },
      { damage: 8, cooldownPct: 0.1 },
    ],
  },
  {
    id: 'sword',
    name: 'Kılıç Savuruşu',
    icon: '🗡️',
    description: 'En yakın düşmana doğru geniş bir yay çizerek önündeki herkesi biçer.',
    behavior: 'arc',
    // count: savuruş sayısı (eşit açılarla), area: menzil
    base: { damage: 18, cooldown: 1.1, count: 1, speed: 0, area: 3.2, duration: 0, pierce: 0, knockback: 4 },
    levels: [
      { damage: 6 },
      { areaPct: 0.15 },
      { cooldownPct: 0.12 },
      { count: 1 },
      { damage: 8, areaPct: 0.1 },
      { cooldownPct: 0.12 },
      { damage: 12, count: 1 },
    ],
  },
  {
    id: 'orbit',
    name: 'Yörünge Taşları',
    icon: '🪨',
    description: 'Etrafında dönen taşlar değdiği düşmanları ezer.',
    behavior: 'orbit',
    // count: taş sayısı, speed: dönüş hızı (rad/s), area: yörünge yarıçapı, cooldown: vuruş aralığı
    base: {
      damage: 9,
      cooldown: 0.25,
      count: 2,
      speed: 3.2,
      area: 2.4,
      duration: 0,
      pierce: 0,
      knockback: 2.5,
    },
    levels: [
      { count: 1 },
      { damage: 5 },
      { areaPct: 0.2 },
      { count: 1 },
      { damage: 7 },
      { cooldownPct: 0.2 },
      { count: 1, damage: 8 },
    ],
  },
  {
    id: 'boomerang',
    name: 'Bumerang Balta',
    icon: '🪓',
    description: 'Fırlatılan balta düşmanları delip geçer ve sana geri döner.',
    behavior: 'boomerang',
    base: {
      damage: 16,
      cooldown: 1.6,
      count: 1,
      speed: 15,
      area: 0.55,
      duration: 1.6,
      pierce: 255,
      knockback: 3,
    },
    levels: [
      { damage: 6 },
      { count: 1 },
      { areaPct: 0.2 },
      { damage: 8 },
      { count: 1 },
      { cooldownPct: 0.15 },
      { damage: 12, areaPct: 0.2 },
    ],
  },
  {
    id: 'chain',
    name: 'Zincir Şimşek',
    icon: '⚡',
    description: 'Şimşek en yakın düşmana çarpar, sonra yakındakilere sekerek ilerler.',
    behavior: 'chain',
    // count: toplam isabet sayısı, area: sekme mesafesi
    base: { damage: 14, cooldown: 1.3, count: 3, speed: 0, area: 6, duration: 0, pierce: 0, knockback: 1 },
    levels: [
      { count: 1 },
      { damage: 6 },
      { count: 1 },
      { cooldownPct: 0.15 },
      { count: 2 },
      { damage: 8 },
      { count: 2, damage: 6 },
    ],
  },
  {
    id: 'mortar',
    name: 'Havan',
    icon: '💣',
    description: 'En kalabalık noktaya mermi yağdırır. Düşmeden önce yerde uyarı halkası belirir.',
    behavior: 'mortar',
    // area: patlama yarıçapı, duration: düşme süresi
    base: { damage: 30, cooldown: 2.2, count: 1, speed: 0, area: 3, duration: 0.8, pierce: 0, knockback: 5 },
    levels: [
      { damage: 10 },
      { areaPct: 0.2 },
      { count: 1 },
      { cooldownPct: 0.15 },
      { damage: 15 },
      { count: 1 },
      { areaPct: 0.25, damage: 15 },
    ],
  },
  {
    id: 'shotgun',
    name: 'Saçma Tüfeği',
    icon: '🔫',
    description: 'En yakın düşmana doğru kısa menzilli bir saçma yelpazesi ateşler.',
    behavior: 'cone',
    base: {
      damage: 7,
      cooldown: 1.25,
      count: 5,
      speed: 24,
      area: 0.25,
      duration: 0.45,
      pierce: 1,
      knockback: 3,
    },
    levels: [
      { count: 2 },
      { damage: 3 },
      { cooldownPct: 0.15 },
      { pierce: 1 },
      { count: 2 },
      { damage: 4 },
      { count: 3, damage: 4 },
    ],
  },
];

export const WEAPON_INDEX: Record<string, number> = Object.fromEntries(WEAPONS.map((w, i) => [w.id, i]));

export function weaponMaxLevel(def: WeaponDef): number {
  return def.levels.length + 1;
}

/** Deltayı nadirlik çarpanıyla okunur metne çevirir: "+9 hasar, bekleme −%22". */
export function describeDelta(d: WeaponLevelDelta, mult: number): string {
  const parts: string[] = [];
  if (d.damage) parts.push(`+${Math.round(d.damage * mult)} hasar`);
  if (d.count) parts.push(`+${d.count} mermi`);
  if (d.pierce) parts.push(`+${d.pierce} delme`);
  if (d.cooldownPct) parts.push(`bekleme −%${Math.round(Math.min(0.6, d.cooldownPct * mult) * 100)}`);
  if (d.areaPct) parts.push(`alan +%${Math.round(d.areaPct * mult * 100)}`);
  if (d.durationPct) parts.push(`süre +%${Math.round(d.durationPct * mult * 100)}`);
  const s = parts.join(', ');
  return s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1);
}
