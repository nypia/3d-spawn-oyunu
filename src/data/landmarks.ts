/**
 * Haritadaki özel yerler ve olaylar: Ruh Kazanı, Lanet Sunağı, Hazine Goblini.
 */

/**
 * Ruh Kazanı: yakınında öldürülen her düşmanın ruhu kazana akar. Dolunca patlar (çevresine hasar ve
 * itme), şanslı bir kazan sandığı bırakır, bir süre soğur; her patlamada daha çok ruh ister.
 */
export const CAULDRON = {
  /** Ruh toplama yarıçapı (m). */
  radius: 9,
  /** Dolması için gereken ruh: base × growth^patlama × cycleSouls^(döngü−1). */
  baseSouls: 50,
  growth: 1.6,
  cycleSouls: 1.25,
  /** Ruh değerleri: sıradan 1, elit, boss, çağrılan. */
  eliteSouls: 8,
  bossSouls: 40,
  summonSouls: 0.5,
  /** Patlamadan sonra soğuma (s). */
  cooldown: 60,
  eruptRadius: 9,
  eruptDamage: 120,
  eruptKnock: 14,
};

export function cauldronSouls(level: number, cycle: number): number {
  return Math.round(CAULDRON.baseSouls * CAULDRON.growth ** level * CAULDRON.cycleSouls ** (cycle - 1));
}

/** Lanet Sunağı: üstüne basınca iki pakt sunar; reddedilirse uzaklaşıp dönünce aynı seçenekler gelir. */
export const ALTAR = {
  radius: 2.2,
  rearmDistance: 5,
  choices: 2,
};

/**
 * Hazine Goblini: ara sıra çıkar, oyuncudan kaçar, vuruldukça altın saçar. Sandık, XP ve ruh vermez;
 * süresi dolunca ya da çok uzaklaşınca kaybolur.
 */
export const GOBLIN = {
  /** İlk çıkış (s) ve sonraki çıkışlar arası. */
  first: 150,
  intervalMin: 150,
  intervalMax: 210,
  /** Kaçmadan önce kalma süresi (s). */
  life: 25,
  spawnDist: 18,
  escapeDist: 60,
  /** Vurulunca bu süre boyunca hızlanır. */
  panicTime: 0.8,
  panicMul: 1.45,
  /** Bu mesafeden uzaktaysa yavaşlayıp oyuncuyu kışkırtır. */
  tauntDist: 25,
  tauntMul: 0.6,
  /** Canının her bu kadarı düştüğünde altın düşer. */
  dropStep: 0.08,
  dropValue: 2,
  deathCoins: 24,
  deathCoinValue: 2,
  deathBag: 20,
};
