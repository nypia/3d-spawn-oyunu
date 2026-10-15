/**
 * HUD duyuru türleri (`world.announceFx`: tür, değer, ek). Ses ve ekran efektleri de bunları dinler.
 */
/** Temalı dalga olayı: değer = WAVE_EVENTS indeksi, ek = doğan sayı. */
export const ANN_EVENT = 0;
/** Hazine Goblini çıktı / kaçtı. */
export const ANN_GOBLIN = 1;
export const ANN_GOBLIN_ESCAPE = 2;
/** Ruh Kazanı patladı: değer = kazan indeksi. */
export const ANN_CAULDRON = 3;
/** Pakt yapıldı: değer = PACTS indeksi. */
export const ANN_PACT = 4;
/** Boss yaklaşıyor / doğdu / yenildi: değer = BOSSES indeksi. */
export const ANN_BOSS_WARN = 5;
export const ANN_BOSS_SPAWN = 6;
export const ANN_BOSS_DEAD = 7;
