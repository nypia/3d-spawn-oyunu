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
/** Mezar Bekçisi: uzaktan, yavaş ve yön değiştiren, yerde süzülen mor küre büyüsü. */
export const KEEPER: RangedParams = {
  minRange: 11,
  maxRange: 16,
  fireRange: 22,
  cooldown: 4.5,
  castTime: 0.8,
  shot: SHOT_ORB,
  shotSpeed: 6.5,
  shotDamage: 12,
  shotRadius: 0.45,
  shotLife: 5,
  homing: 1.6,
};
/** Vampir: 3,5–11 m'de durup hazırlanır, sonra oyuncunun son konumuna atılır. */
export const VAMPIRE_DASH: DashParams = {
  triggerMin: 3.5,
  triggerMax: 11,
  windup: 0.6,
  speed: 15,
  time: 0.5,
  recover: 0.45,
  cooldown: 3.8,
  damageMul: 1.4,
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
    damage: 7,
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
  {
    id: 'zombie',
    name: 'Zombi',
    hp: 42,
    speed: 2.2,
    damage: 9,
    radius: 0.55,
    height: 1.8,
    xp: 3,
    cost: 2,
    hover: 0,
    knockbackResist: 0.45,
    behavior: 'chase',
    role: 'regular',
    scale: 1,
  },
  {
    id: 'ghost',
    name: 'Hayalet',
    hp: 24,
    speed: 3.9,
    damage: 9,
    radius: 0.5,
    height: 1.6,
    xp: 3,
    cost: 2,
    hover: 0.35,
    knockbackResist: 0.3,
    behavior: 'phase',
    role: 'regular',
    scale: 1,
    phase: { weaveAmp: 0.75, weaveFreq: 2.4 },
  },
  {
    id: 'vampire',
    name: 'Vampir',
    hp: 60,
    speed: 3.5,
    damage: 14,
    radius: 0.5,
    height: 1.9,
    xp: 6,
    cost: 4,
    hover: 0,
    knockbackResist: 0.35,
    behavior: 'dasher',
    role: 'regular',
    scale: 1,
    dash: VAMPIRE_DASH,
  },
  {
    id: 'keeper',
    name: 'Mezar Bekçisi',
    hp: 65,
    speed: 2.4,
    damage: 8,
    radius: 0.55,
    height: 1.9,
    xp: 7,
    cost: 5,
    hover: 0,
    knockbackResist: 0.5,
    behavior: 'ranged',
    role: 'regular',
    scale: 1,
    ranged: KEEPER,
  },
  {
    // Çizelgeden doğmaz: Landmarks ara sıra çıkarır (bkz. data/landmarks GOBLIN).
    id: 'goblin',
    name: 'Hazine Goblini',
    hp: 260,
    speed: 6,
    damage: 0,
    radius: 0.45,
    height: 1.2,
    xp: 0,
    cost: 0,
    hover: 0,
    knockbackResist: 0.6,
    behavior: 'flee',
    role: 'special',
    scale: 1,
  },
  // Boss'lar (zamanlama ve saldırılar data/bosses.ts'te); görünüm `model` türünün büyütülmüş hâli.
  {
    id: 'slimeKing',
    name: 'Balçık Kral',
    hp: 1500,
    speed: 3,
    damage: 14,
    radius: 0.55,
    height: 0.9,
    xp: 150,
    cost: 0,
    hover: 0,
    knockbackResist: 1,
    behavior: 'boss',
    role: 'boss',
    scale: 3.2,
    model: 'slime',
  },
  {
    id: 'vampireLord',
    name: 'Vampir Lordu',
    hp: 2400,
    speed: 3.8,
    damage: 22,
    radius: 0.5,
    height: 1.9,
    xp: 250,
    cost: 0,
    hover: 0,
    knockbackResist: 1,
    behavior: 'boss',
    role: 'boss',
    scale: 2,
    model: 'vampire',
  },
  {
    id: 'stoneGiant',
    name: 'Taş Dev',
    hp: 3800,
    speed: 2.3,
    damage: 28,
    radius: 0.85,
    height: 2.2,
    xp: 400,
    cost: 0,
    hover: 0,
    knockbackResist: 1,
    behavior: 'boss',
    role: 'boss',
    scale: 2.6,
    model: 'golem',
  },
  {
    id: 'boneKing',
    name: 'Kemik Kral',
    hp: 6000,
    speed: 3.2,
    damage: 32,
    radius: 0.5,
    height: 1.75,
    xp: 800,
    cost: 0,
    hover: 0,
    knockbackResist: 1,
    behavior: 'boss',
    role: 'boss',
    scale: 3,
    model: 'skeleton',
  },
];

export const ENEMY_INDEX: Record<string, number> = Object.fromEntries(ENEMIES.map((e, i) => [e.id, i]));

/** Spawn çizelgesinden ve hile/bench'ten doğabilen sıradan türler. */
export const REGULAR_TYPES: readonly number[] = ENEMIES.flatMap((e, i) => (e.role === 'regular' ? [i] : []));
