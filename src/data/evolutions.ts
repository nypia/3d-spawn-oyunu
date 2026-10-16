import { WEAPON_INDEX, WEAPONS, type WeaponDef, type WeaponSignature, type WeaponStats } from './weapons';

/**
 * Silah evrimi (Vampire Survivors'tan esinli): silah maks seviyede + eşleşen kitap en az Sv.1 iken
 * açılan bir sonraki sandık eşya yerine evrim verir. Evrim aynı davranışı (behavior) kullanır, daha
 * güçlü bir tabana geçer ve davranışı değiştiren bir imza kazanır; alınmış seviye yükseltmeleri
 * (nadirlik çarpanlarıyla) korunur.
 */
export interface EvolutionDef {
  /** Temel silah kimliği. */
  weapon: string;
  /** Gereken kitap kimliği. */
  tome: string;
  def: WeaponDef;
}

function evolve(
  from: string,
  tome: string,
  id: string,
  name: string,
  icon: string,
  description: string,
  tint: number,
  base: Partial<WeaponStats>,
  signature: WeaponSignature,
  signatureName: string,
  signatureText: string,
): EvolutionDef {
  const src = WEAPONS[WEAPON_INDEX[from]];
  return {
    weapon: from,
    tome,
    def: {
      ...src,
      id,
      name,
      icon,
      description,
      base: { ...src.base, ...base },
      evolvesFrom: from,
      tint,
      signature,
      signatureName,
      signatureText,
    },
  };
}

export const EVOLUTIONS: readonly EvolutionDef[] = [
  evolve(
    'magicBolt',
    'fury',
    'holyWand',
    'Kutsal Asa',
    '🪄',
    'Neredeyse beklemesiz, delip geçen altın büyü mermileri.',
    0xffd84d,
    { damage: 20, cooldown: 0.45, speed: 24, area: 0.45, duration: 2.4, pierce: 2, knockback: 3 },
    { kind: 'split', count: 2, damageMul: 0.5, spread: 0.6 },
    'Işık Bölünmesi',
    'Öldüren mermi iki küçük ışığa bölünür.',
  ),
  evolve(
    'fireAura',
    'vitality',
    'hellfire',
    'Cehennem Halesi',
    '🌋',
    'Geniş ve çok daha sıcak bir hale; yakındaki her şeyi kül eder.',
    0xb32bff,
    { damage: 12, cooldown: 0.4, area: 3.8, knockback: 1.2 },
    { kind: 'drain', perHit: 0.12, maxPerTick: 1.2 },
    'Ruh Emme',
    'Hale yaktığı her düşmandan can emer.',
  ),
  evolve(
    'sword',
    'power',
    'bloodBlade',
    'Kan Kılıcı',
    '🩸',
    'Her yöne aynı anda savrulur: etrafında 360° kan yayı.',
    0xff2b3d,
    { damage: 32, cooldown: 0.9, count: 3, area: 4, knockback: 6 },
    { kind: 'execute', threshold: 0.15, heal: 1 },
    'İnfaz',
    "Canı %15'in altına düşeni (boss hariç) anında biçer, +1 can.",
  ),
  evolve(
    'orbit',
    'breadth',
    'planetRing',
    'Gezegen Halkası',
    '🪐',
    'Daha çok, daha büyük ve daha hızlı dönen gezegenler.',
    0x7fe3ff,
    { damage: 16, cooldown: 0.2, count: 4, speed: 4.2, area: 3.2, knockback: 4 },
    { kind: 'breathe', amp: 1, period: 6 },
    'Nefes Alan Yörünge',
    'Halka 6 sn’de bir iki katına genişleyip daralır.',
  ),
  evolve(
    'boomerang',
    'multiply',
    'cycloneAxe',
    'Kasırga Baltası',
    '🌪️',
    'Dev baltalar kasırga gibi döner, yolundaki her şeyi biçer.',
    0x9dffb0,
    { damage: 28, cooldown: 1.2, count: 2, speed: 17, area: 0.8, duration: 2, knockback: 4 },
    { kind: 'whirl', time: 0.6, rehit: 0.2 },
    'Girdap',
    'Balta en uzak noktada durup döner, tekrar tekrar vurur.',
  ),
  evolve(
    'chain',
    'luck',
    'storm',
    'Fırtına',
    '🌩️',
    'Şimşek onlarca düşmana seker; gökyüzü senin tarafında.',
    0xc59bff,
    { damage: 24, cooldown: 0.9, count: 6, area: 8, knockback: 1.5 },
    { kind: 'skyStrike', chance: 0.25, luckMul: 0.5, radius: 2, damageMul: 0.6 },
    'Gök Gürültüsü',
    'Her sekmede gökten yıldırım düşebilir (Şans artırır).',
  ),
  evolve(
    'mortar',
    'magnet',
    'meteor',
    'Meteor Yağmuru',
    '☄️',
    'Gökten kalabalıkların üstüne meteorlar yağar.',
    0xff7a1a,
    { damage: 55, cooldown: 1.7, count: 2, area: 4, duration: 0.6, knockback: 7 },
    { kind: 'pull', radiusMul: 1.8, strength: 3 },
    'Kara Delik',
    'Meteor düşmeden önce çevresindekileri çukura çeker.',
  ),
  evolve(
    'shotgun',
    'agility',
    'dragonBreath',
    'Ejderha Nefesi',
    '🐉',
    'Geniş bir alev saçması: daha çok, daha uzağa, daha delici.',
    0xff5a1f,
    { damage: 12, cooldown: 0.95, count: 7, speed: 26, area: 0.32, duration: 0.55, pierce: 2, knockback: 4 },
    { kind: 'burn', time: 2.5, dpsMul: 0.4 },
    'Yanık',
    'Saçmalar isabet ettiğini 2,5 sn yakar.',
  ),
];

/** Temel silah kimliği → evrim. */
export const EVOLUTION_BY_WEAPON: Record<string, EvolutionDef> = Object.fromEntries(
  EVOLUTIONS.map((e) => [e.weapon, e]),
);
