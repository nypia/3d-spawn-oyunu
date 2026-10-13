/**
 * Silah = veri + davranış. Davranış kodu sim/weapons/Weapons.ts içinde; burada sadece sayılar.
 * Seviye 1 = base; her yükseltme `levels[i]` deltasını kartın nadirlik çarpanıyla uygular.
 * Kart açıklaması deltadan otomatik üretilir (describeDelta).
 */
export type WeaponBehavior = 'homingBolt' | 'aura';

export interface WeaponStats {
  damage: number;
  /** Saniye cinsinden bekleme (aura için hasar tick aralığı). */
  cooldown: number;
  /** Atış başına mermi sayısı. */
  count: number;
  /** m/s */
  speed: number;
  /** Mermi yarıçapı ya da aura yarıçapı (m). */
  area: number;
  /** Mermi ömrü (s). */
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
