/**
 * chase: kovalar · ranged: mesafe korur ve ateş eder · exploder: yaklaşıp fitili ateşler ·
 * phase: engellerden geçer, dalgalanarak gelir · dasher: hazırlanıp atılır · flee: kaçar (goblin) ·
 * boss: BossController yönetir.
 */
export type EnemyBehavior = 'chase' | 'ranged' | 'exploder' | 'phase' | 'dasher' | 'flee' | 'boss';
/** regular: spawn çizelgesinden gelir · special: olayla gelir (goblin) · boss */
export type EnemyRole = 'regular' | 'special' | 'boss';

/** Düşman mermisi görsel türü (enemyShots.kind). */
export const SHOT_ARROW = 0;
export const SHOT_ORB = 1;

/** Menzilli düşman: tercih ettiği mesafe aralığı (m), atış aralığı (s), mermi özellikleri. */
export interface RangedParams {
  minRange: number;
  maxRange: number;
  fireRange: number;
  cooldown: number;
  /** Atıştan önceki hazırlık (render: yay germe / büyü). */
  castTime: number;
  shot: number;
  shotSpeed: number;
  shotDamage: number;
  shotRadius: number;
  shotLife: number;
  /** Saniyede dönebileceği açı (rad); 0 = düz gider. */
  homing: number;
}

/** Atılan düşman: tetik mesafesi, hazırlık, atılma hızı/süresi, toparlanma, bekleme, temas çarpanı. */
export interface DashParams {
  triggerMin: number;
  triggerMax: number;
  windup: number;
  speed: number;
  time: number;
  recover: number;
  cooldown: number;
  damageMul: number;
}

/** Hayalet: yana dalgalanma genliği ve frekansı. */
export interface PhaseParams {
  weaveAmp: number;
  weaveFreq: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  /** Model boyu (m, boy çarpanı 1'de): temas ve vuruş yüksekliği. */
  height: number;
  xp: number;
  /** Spawn direktörünün bu düşman için harcadığı kredi. */
  cost: number;
  /** Yerden yükseklik (uçanlar için > 0). */
  hover: number;
  /** Geri itilme direnci (0 = tam itilir, 1 = hiç itilmez). */
  knockbackResist: number;
  behavior: EnemyBehavior;
  role: EnemyRole;
  /** Taban boy çarpanı (boss'lar büyük). */
  scale: number;
  /** Render: başka türün modelini (rig) kullan. */
  model?: string;
  ranged?: RangedParams;
  dash?: DashParams;
  phase?: PhaseParams;
}

/** Okçu: mesafe korur, göğüs hizasında düz ok atar. */
export const ARCHER: RangedParams = {
  minRange: 10,
  maxRange: 14,
  fireRange: 18,
  cooldown: 2.5,
  castTime: 0.6,
  shot: SHOT_ARROW,
  shotSpeed: 13,
  shotDamage: 7,
  shotRadius: 0.3,
  shotLife: 2.5,
  homing: 0,
};
/** Patlayan: fitil mesafesi, fitil süresi (s), patlama yarıçapı (m). */
export const EXPLODER = { triggerRange: 2, fuse: 0.8, radius: 2.6 };
/** Elit çarpanları; aralık zamanla kısalır (en az `minInterval`), Kan Ayı'nda dalga başına birden çok. */
export const ELITE = {
  hp: 8,
  damage: 1.5,
  scale: 1.6,
  xp: 12,
  speed: 0.9,
  interval: 75,
  minInterval: 40,
  maxPerWave: 3,
};

export const ENEMIES: readonly EnemyDef[] = [
  {
    id: 'slime',
    name: 'Balçık',
    hp: 10,
    speed: 2.7,
    damage: 5,
    radius: 0.55,
    height: 0.9,
    xp: 1,
    cost: 1,
    hover: 0,
    knockbackResist: 0,
    behavior: 'chase',
    role: 'regular',
    scale: 1,
  },
  {
    id: 'skeleton',
    name: 'İskelet',
    hp: 26,
    speed: 3.5,
    damage: 8,
    radius: 0.5,
    height: 1.75,
    xp: 2,
    cost: 2,
    hover: 0,
    knockbackResist: 0.2,
    behavior: 'chase',
    role: 'regular',
    scale: 1,
  },
  {
    id: 'bat',
    name: 'Yarasa',
    hp: 9,
    speed: 5.6,
    damage: 4,
    radius: 0.45,
    height: 0.6,
    xp: 1,
    cost: 1,
    hover: 1.4,
    knockbackResist: 0,
    behavior: 'chase',
    role: 'regular',
    scale: 1,
  },
  {
    id: 'exploder',
    name: 'Patlayan',
    hp: 14,
    speed: 4.2,
    damage: 15,
    radius: 0.5,
    height: 1,
    xp: 2,
    cost: 2,
    hover: 0,
    knockbackResist: 0,
    behavior: 'exploder',
    role: 'regular',
    scale: 1,
  },
  {
    id: 'archer',
    name: 'Okçu',
    hp: 18,
    speed: 3.2,
    damage: 6,
    radius: 0.5,
    height: 1.9,
    xp: 4,
    cost: 3,
    hover: 0,
    knockbackResist: 0.1,
    behavior: 'ranged',
    role: 'regular',
    scale: 1,
    ranged: ARCHER,
  },
  {
    id: 'golem',
    name: 'Golem',
    hp: 70,
    speed: 1.9,
    damage: 12,
    radius: 0.85,
    height: 2.2,
    xp: 8,
    cost: 4,
    hover: 0,
    knockbackResist: 0.8,
    behavior: 'chase',
    role: 'regular',
    scale: 1,
  },
];

export const ENEMY_INDEX: Record<string, number> = Object.fromEntries(ENEMIES.map((e, i) => [e.id, i]));

/** Spawn çizelgesinden ve hile/bench'ten doğabilen sıradan türler. */
export const REGULAR_TYPES: readonly number[] = ENEMIES.flatMap((e, i) => (e.role === 'regular' ? [i] : []));
