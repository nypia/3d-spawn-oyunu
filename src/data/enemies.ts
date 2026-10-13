export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  xp: number;
  /** Spawn direktörünün bu düşman için harcadığı kredi. */
  cost: number;
  /** Bu saniyeden itibaren spawn havuzuna girer. */
  unlockTime: number;
  /** Havuzdaki seçilme ağırlığı. */
  weight: number;
  /** Yerden yükseklik (uçanlar için > 0). */
  hover: number;
  /** Geri itilme direnci (0 = tam itilir, 1 = hiç itilmez). */
  knockbackResist: number;
  /** chase: kovalar · ranged: mesafe korur ve ateş eder · exploder: yaklaşıp fitili ateşler */
  behavior: 'chase' | 'ranged' | 'exploder';
  // Görsel ipuçları (M3'te modellerle değişecek)
  color: number;
  scale: number;
  shape: 'blob' | 'capsule' | 'bat' | 'golem' | 'archer' | 'bomb';
}

/** Okçu: tercih ettiği mesafe aralığı (m), atış aralığı (s), mermi hızı ve hasarı. */
export const ARCHER = {
  minRange: 10,
  maxRange: 14,
  fireRange: 18,
  cooldown: 2.5,
  shotSpeed: 13,
  shotDamage: 7,
};
/** Patlayan: fitil mesafesi, fitil süresi (s), patlama yarıçapı (m). */
export const EXPLODER = { triggerRange: 2, fuse: 0.8, radius: 2.6 };
/** Elit çarpanları. */
export const ELITE = { hp: 8, damage: 1.5, scale: 1.6, xp: 10, speed: 0.9, interval: 75 };

export const ENEMIES: readonly EnemyDef[] = [
  {
    id: 'slime',
    name: 'Balçık',
    hp: 10,
    speed: 2.7,
    damage: 5,
    radius: 0.55,
    xp: 1,
    cost: 1,
    unlockTime: 0,
    weight: 10,
    hover: 0,
    knockbackResist: 0,
    behavior: 'chase',
    color: 0x6fd35a,
    scale: 1,
    shape: 'blob',
  },
  {
    id: 'skeleton',
    name: 'İskelet',
    hp: 26,
    speed: 3.5,
    damage: 8,
    radius: 0.5,
    xp: 2,
    cost: 2,
    unlockTime: 60,
    weight: 7,
    hover: 0,
    knockbackResist: 0.2,
    behavior: 'chase',
    color: 0xe9e2cf,
    scale: 1,
    shape: 'capsule',
  },
  {
    id: 'bat',
    name: 'Yarasa',
    hp: 9,
    speed: 5.6,
    damage: 4,
    radius: 0.45,
    xp: 1,
    cost: 1,
    unlockTime: 150,
    weight: 6,
    hover: 1.4,
    knockbackResist: 0,
    behavior: 'chase',
    color: 0x7a4bd1,
    scale: 1,
    shape: 'bat',
  },
  {
    id: 'exploder',
    name: 'Patlayan',
    hp: 14,
    speed: 4.2,
    damage: 15,
    radius: 0.5,
    xp: 2,
    cost: 2,
    unlockTime: 150,
    weight: 4,
    hover: 0,
    knockbackResist: 0,
    behavior: 'exploder',
    color: 0xff6b3d,
    scale: 1,
    shape: 'bomb',
  },
  {
    id: 'archer',
    name: 'Okçu',
    hp: 18,
    speed: 3.2,
    damage: 6,
    radius: 0.5,
    xp: 3,
    cost: 3,
    unlockTime: 210,
    weight: 4,
    hover: 0,
    knockbackResist: 0.1,
    behavior: 'ranged',
    color: 0x4f8a5b,
    scale: 1,
    shape: 'archer',
  },
  {
    id: 'golem',
    name: 'Golem',
    hp: 70,
    speed: 1.9,
    damage: 12,
    radius: 0.85,
    xp: 5,
    cost: 4,
    unlockTime: 270,
    weight: 4,
    hover: 0,
    knockbackResist: 0.8,
    behavior: 'chase',
    color: 0x9a8b78,
    scale: 1,
    shape: 'golem',
  },
];

export const ENEMY_INDEX: Record<string, number> = Object.fromEntries(ENEMIES.map((e, i) => [e.id, i]));
