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
    /** Taban can yenilenmesi (can/sn). */
    baseRegen: 0.5,
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
    base: 5,
    exp: 1.42,
    /** Yerde en fazla bu kadar XP taşı; fazlası en uzak taşı yeni taşa katar (XP kaybolmaz). */
    gemCapacity: 800,
    /** Düşman XP'si zamanla artar: xp × (1 + xpPerMinute·dk). */
    xpPerMinute: 0.08,
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
    /** Saniye başına kredi: a + b·dk + c·dk² (dk = çizelge dakikası). */
    creditA: 1,
    creditB: 1,
    creditC: 0.08,
    maxStoredCredit: 40,
    /** Düşman canı: 1 + a·dk + b·dk² (20. dakikada ×12,6). */
    hpA: 0.08,
    hpB: 0.025,
    /** Düşman hasarı: 1 + a·dk + b·dk². */
    damageA: 0.04,
    damageB: 0.004,
    /** Düşman hızı: dakikada +%1, en fazla ×1.2; atılmalar hariç mutlak üst sınır (m/s). */
    speedPerMinute: 0.01,
    speedMax: 1.2,
    maxEnemySpeed: 8.5,
    /** Temalı olaylar sınırı bu kadar aşabilir (kalabalık anlarında da gelsinler). */
    eventOverflow: 1.15,
    /** Bu kadar geç kalmış olay atlanır (hata ayıklama zaman atlamaları). */
    staleEvent: 5,
    /** Çember olaylarının varsayılan yarıçapı (m). */
    ringRadius: 20,
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
    vaseMagnetChance: 0.08,
    /** Elitler yarı yarıya mıknatıs düşürür. */
    eliteMagnetChance: 0.5,
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
