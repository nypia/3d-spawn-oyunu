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
  // Görsel ipuçları (M3'te modellerle değişecek)
  color: number;
  scale: number;
  shape: 'blob' | 'capsule' | 'bat';
}

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
    color: 0x7a4bd1,
    scale: 1,
    shape: 'bat',
  },
];

export const ENEMY_INDEX: Record<string, number> = Object.fromEntries(ENEMIES.map((e, i) => [e.id, i]));
