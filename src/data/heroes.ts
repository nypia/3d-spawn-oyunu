import type { LoadoutEffect } from './effects';

/** Kahramanın nasıl açıldığı: baştan açık, gümüşle ya da bir başarımla. */
export type HeroUnlock =
  | { kind: 'free' }
  | { kind: 'silver'; cost: number }
  | { kind: 'achievement'; id: string; text: string };

/**
 * Seçilebilen maceracılar (Kenney Mini Characters): her birinin başlangıç silahı ve pasif bonusu var.
 * İkisi açıktır; ikisi gümüşle ya da başarımla açılır.
 */
export interface HeroDef {
  id: string;
  name: string;
  /** "Büyücü", "Avcı"… */
  title: string;
  /** GameAssets anahtarı. */
  model: string;
  /** Başlangıç silahı (WEAPONS kimliği). */
  weapon: string;
  passive: readonly LoadoutEffect[];
  passiveText: string;
  unlock: HeroUnlock;
}

export const HEROES: readonly HeroDef[] = [
  {
    id: 'ela',
    name: 'Ela',
    title: 'Büyücü',
    model: 'characters/character-female-f',
    weapon: 'magicBolt',
    passive: [
      { stat: 'area', mode: 'mult', value: 0.1 },
      { stat: 'projectileSpeed', mode: 'mult', value: 0.15 },
    ],
    passiveText: '+%10 alan, +%15 mermi hızı',
    unlock: { kind: 'free' },
  },
  {
    id: 'can',
    name: 'Can',
    title: 'Kılıç Ustası',
    model: 'characters/character-male-f',
    weapon: 'sword',
    passive: [
      { stat: 'maxHp', mode: 'flat', value: 20 },
      { stat: 'armor', mode: 'flat', value: 1 },
      { stat: 'knockback', mode: 'mult', value: 0.1 },
    ],
    passiveText: '+20 can, +1 zırh, +%10 geri itme',
    unlock: { kind: 'free' },
  },
  {
    id: 'bora',
    name: 'Bora',
    title: 'Avcı',
    model: 'characters/character-male-b',
    weapon: 'boomerang',
    passive: [
      { stat: 'moveSpeed', mode: 'mult', value: 0.1 },
      { stat: 'jumpCount', mode: 'flat', value: 1 },
    ],
    passiveText: '+%10 hız, +1 zıplama',
    unlock: { kind: 'silver', cost: 300 },
  },
  {
    id: 'su',
    name: 'Su',
    title: 'Fırtına Cadısı',
    model: 'characters/character-female-b',
    weapon: 'chain',
    passive: [
      { stat: 'regen', mode: 'flat', value: 0.4 },
      { stat: 'luck', mode: 'flat', value: 0.1 },
    ],
    passiveText: '+0,4 can/sn, +0,1 şans',
    unlock: { kind: 'achievement', id: 'vampireLord', text: "Vampir Lordu'nu yen" },
  },
];

export const HERO_BY_ID: Readonly<Record<string, HeroDef>> = Object.fromEntries(HEROES.map((h) => [h.id, h]));
