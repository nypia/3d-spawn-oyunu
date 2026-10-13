/**
 * Oyunun ayarlanabilir sayıları. Dengeleme yaparken ilk bakılacak yer burası.
 */
export const BALANCE = {
  /** Simülasyon adımı (saniye). */
  simStep: 1 / 60,

  arena: {
    /** Haritanın bir kenarı (m). Merkez (0,0). */
    size: 320,
    /** Yükseklik haritası hücre boyutu (m). */
    cell: 2,
    /** Kenarlardaki duvar/kayalık bandının genişliği (m). */
    wallBand: 18,
    /** Oyuncunun başladığı düzleştirilmiş alanın yarıçapı (m). */
    spawnFlatRadius: 14,
  },

  player: {
    radius: 0.5,
    height: 1.8,
    baseHp: 100,
    baseMoveSpeed: 7,
    groundAccel: 70,
    airAccel: 22,
    gravity: 30,
    jumpHeight: 2.3,
    coyoteTime: 0.12,
    jumpBuffer: 0.12,
    /** Yerde yokuş aşağı "yapışma" mesafesi (kayarken kapalı). */
    stepDown: 0.45,
    /** Bu değerden dik yokuşlara (normal.y) tırmanılamaz. */
    maxWalkSlopeNormalY: 0.62,
    slideBoost: 1.55,
    slideFriction: 6,
    slideSteer: 2.5,
    slideMinSpeedFactor: 0.6,
    slideCooldown: 0.35,
    maxSpeed: 32,
    pickupRange: 3.2,
    contactCooldown: 0.5,
  },

  xp: {
    /** xpToNext(n) = round(base * n^exp) */
    base: 8,
    exp: 1.4,
    gemCapacity: 2500,
    magnetBaseSpeed: 9,
    magnetAccel: 45,
    collectRadius: 0.9,
  },

  spawn: {
    capDesktop: 600,
    capMobile: 250,
    ringMin: 26,
    ringMax: 34,
    despawnDistance: 58,
    /** Saniye başına kredi: a + b·dk + c·dk² */
    creditA: 0.9,
    creditB: 0.85,
    creditC: 0.07,
    maxStoredCredit: 40,
    hpPerMinute: 0.12,
    damagePerMinute: 0.06,
    /** Kuşatma halkası olayı aralığı (s). */
    ringEventInterval: 60,
  },

  loot: {
    /** Düşmanın altın düşürme ihtimali. */
    goldDropChance: 0.08,
    chestBasePrice: 20,
    /** Her açılışta fiyat çarpanı. */
    chestPriceGrowth: 1.4,
    chestRadius: 1.6,
    vaseRadius: 1.1,
    vaseGoldMin: 1,
    vaseGoldMax: 4,
    vaseHealChance: 0.1,
    vaseMagnetChance: 0.03,
    healAmount: 25,
    pickupCapacity: 400,
  },

  levelUp: {
    choices: 3,
    weaponSlots: 4,
    tomeSlots: 4,
  },
} as const;

export function xpToNext(level: number): number {
  return Math.round(BALANCE.xp.base * level ** BALANCE.xp.exp);
}
