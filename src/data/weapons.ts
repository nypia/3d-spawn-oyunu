/**
 * Silah = veri + davranış. Davranış kodu sim/weapons/behaviors altında; burada sadece sayılar.
 * Seviye 1 = baseStats; her sonraki seviye `levels[i]` deltasını uygular.
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

export interface WeaponLevelDelta {
  desc: string;
  damage?: number;
  cooldownMul?: number;
  count?: number;
  area?: number;
  pierce?: number;
  speed?: number;
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
      { desc: '+1 mermi', count: 1 },
      { desc: '+6 hasar', damage: 6 },
      { desc: 'Bekleme süresi −%15', cooldownMul: 0.85 },
      { desc: '+1 mermi', count: 1 },
      { desc: '+1 delme, +5 hasar', pierce: 1, damage: 5 },
      { desc: '+1 mermi', count: 1 },
      { desc: '+10 hasar, bekleme −%10', damage: 10, cooldownMul: 0.9 },
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
      { desc: 'Alan +%20', area: 0.56 },
      { desc: '+4 hasar', damage: 4 },
      { desc: 'Tick aralığı −%15', cooldownMul: 0.85 },
      { desc: 'Alan +%20, +3 hasar', area: 0.6, damage: 3 },
      { desc: '+6 hasar', damage: 6 },
      { desc: 'Alan +%25', area: 0.8 },
      { desc: '+8 hasar, tick −%10', damage: 8, cooldownMul: 0.9 },
    ],
  },
];

export const WEAPON_INDEX: Record<string, number> = Object.fromEntries(WEAPONS.map((w, i) => [w.id, i]));

export function weaponMaxLevel(def: WeaponDef): number {
  return def.levels.length + 1;
}
