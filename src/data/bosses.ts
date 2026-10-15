/**
 * Boss'lar: 5., 10. ve 15. dakikada birer boss, 20. dakikada final. Kan Ayı döngülerinde aynı boss'lar
 * "Kanlı" adla, daha sık saldırarak döner. Her boss bir düşman türüdür (ENEMIES'te role 'boss');
 * burada zamanlaması ve saldırıları tanımlanır. Süreler saniye, mesafeler metre.
 */

/** Saldırılar: oyuncuya önceden kırmızı uyarı alanıyla gösterilir (sim/combat/Hazards). */
export type BossAttack =
  /** Zıplayıp oyuncunun konumuna iner: iniş alanında hasar. */
  | { kind: 'hopSlam'; cooldown: number; radius: number; damage: number; air: number }
  /** Oyuncunun çevresine yağan damlalar. */
  | { kind: 'rain'; cooldown: number; count: number; radius: number; damage: number; spread: number }
  /** Art arda atılmalar (yol çizgiyle gösterilir). */
  | { kind: 'dashChain'; cooldown: number; dashes: number; windup: number; speed: number; time: number }
  /** Yardımcı çağırır. */
  | { kind: 'summon'; cooldown: number; enemy: string; count: number }
  /** Yakındaysa çevresini döver. */
  | { kind: 'slam'; cooldown: number; radius: number; damage: number; windup: number; range: number }
  /** Uzaktaysa kaya fırlatır. */
  | { kind: 'throw'; cooldown: number; radius: number; damage: number; flight: number; minRange: number }
  /** Oyuncuya doğru yelpaze gibi diken çizgileri. */
  | { kind: 'spikeLines'; cooldown: number; lines: number; length: number; width: number; damage: number }
  /** İç içe diken halkaları. */
  | { kind: 'spikeRing'; cooldown: number; rings: number; damage: number }
  /** Hazırlanıp oyuncuya hücum eder. */
  | { kind: 'charge'; cooldown: number; windup: number; speed: number; time: number }
  /** Her yöne küre dalgası. */
  | { kind: 'nova'; cooldown: number; count: number; damage: number; speed: number };

export interface BossDef {
  id: string;
  name: string;
  /** Duyuruda ismin altında. */
  title: string;
  /** ENEMIES kimliği (can, hız, hasar, boyut, görünüm). */
  enemy: string;
  /** 1. döngüde doğduğu an (s). */
  at: number;
  attacks: BossAttack[];
  /** Can bu oranın altına inince eklenen saldırılar. */
  enrage?: { at: number; attacks: BossAttack[] };
  /** Ölünce bölünür. */
  split?: { enemy: string; count: number; scale: number; hpMul: number };
  /** Final boss: ölünce Kan Ayı doğar. */
  final?: boolean;
  /** HUD/render rengi. */
  color: number;
}

export const BOSS = {
  /** Doğmadan kaç saniye önce uyarılır. */
  warn: 10,
  spawnDist: 24,
  /** Can: zaman çarpanı × (1 + hpPerLevel·oyuncu seviyesi) × cycleHp^(döngü−1). */
  hpPerLevel: 0.03,
  cycleHp: 1.25,
  /** Kan Ayı'nda saldırı beklemeleri: cycleCooldown^(döngü−1), en az minCooldownMul. */
  cycleCooldown: 0.85,
  minCooldownMul: 0.55,
  /** Boss yaşarken normal spawn kredisi çarpanı. */
  creditMulAlive: 0.6,
  /** Oyuncu bu kadar uzaktaysa boss hızlanır. */
  catchUpDist: 30,
  catchUpMul: 2,
  /** Atılırken/hücumda temas hasarı çarpanı. */
  dashDamageMul: 1.5,
  /** Boss sandığı: final boss en az epik verir. */
  finalChestMinRarity: 2,
  /** Tespih boss'tan canının bu kadarını alır. */
  rosaryFrac: 0.08,
  /** Doğum anı bu kadar geçmişte kaldıysa (ör. hile ile zaman atlandı) boss atlanır. */
  staleSkip: 30,
  /** İki boss arasında en az bu kadar (s). */
  minGap: 120,
  deathGold: 30,
};

export const BOSSES: readonly BossDef[] = [
  {
    id: 'slimeKing',
    name: 'Balçık Kral',
    title: 'Bataklığın efendisi',
    enemy: 'slimeKing',
    at: 300,
    color: 0x6fd35a,
    attacks: [
      { kind: 'hopSlam', cooldown: 6, radius: 3.6, damage: 24, air: 0.9 },
      { kind: 'rain', cooldown: 9, count: 7, radius: 1.8, damage: 14, spread: 7 },
    ],
    split: { enemy: 'slime', count: 4, scale: 1.7, hpMul: 6 },
  },
  {
    id: 'vampireLord',
    name: 'Vampir Lordu',
    title: 'Gecenin avcısı',
    enemy: 'vampireLord',
    at: 600,
    color: 0xd03a50,
    attacks: [
      { kind: 'dashChain', cooldown: 7, dashes: 3, windup: 0.5, speed: 18, time: 0.45 },
      { kind: 'summon', cooldown: 11, enemy: 'bat', count: 10 },
    ],
    enrage: { at: 0.4, attacks: [{ kind: 'nova', cooldown: 6, count: 16, damage: 16, speed: 7 }] },
  },
  {
    id: 'stoneGiant',
    name: 'Taş Dev',
    title: 'Dağların öfkesi',
    enemy: 'stoneGiant',
    at: 900,
    color: 0x8fa6c8,
    attacks: [
      { kind: 'slam', cooldown: 5, radius: 5.5, damage: 34, windup: 0.9, range: 6 },
      { kind: 'throw', cooldown: 3.5, radius: 2.4, damage: 28, flight: 1.3, minRange: 8 },
    ],
  },
  {
    id: 'boneKing',
    name: 'Kemik Kral',
    title: 'Mezarlığın hükümdarı',
    enemy: 'boneKing',
    at: 1200,
    color: 0xf2e6c8,
    final: true,
    attacks: [
      { kind: 'spikeLines', cooldown: 6, lines: 3, length: 18, width: 1.1, damage: 30 },
      { kind: 'charge', cooldown: 8, windup: 0.8, speed: 16, time: 0.8 },
      { kind: 'summon', cooldown: 12, enemy: 'skeleton', count: 12 },
    ],
    enrage: {
      at: 0.5,
      attacks: [
        { kind: 'spikeRing', cooldown: 9, rings: 3, damage: 30 },
        { kind: 'summon', cooldown: 16, enemy: 'keeper', count: 2 },
      ],
    },
  },
];
