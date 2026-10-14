import type { Rng } from '../../core/Rng';
import { BALANCE } from '../../data/balance';
import { EVOLUTION_BY_WEAPON } from '../../data/evolutions';
import { TOME_INDEX, TOMES, tomeValue } from '../../data/tomes';
import { describeDelta, WEAPONS, weaponMaxLevel } from '../../data/weapons';
import type { World } from '../world/World';
import { RARITIES, type Rarity, rarityMult, rollRarity } from './Rarity';

export type UpgradeOption =
  | { kind: 'weaponNew'; weapon: number }
  | { kind: 'weaponLevel'; weapon: number; toLevel: number; rarity: Rarity }
  | { kind: 'tome'; tome: number; toLevel: number; rarity: Rarity }
  | { kind: 'heal'; amount: number };

export interface UpgradeView {
  icon: string;
  title: string;
  badge: string;
  description: string;
  /** Nadirliği olmayan kartlar (yeni silah, iyileşme) için null. */
  rarity: Rarity | null;
  rarityName: string;
  /** Ek ipucu (maks seviye kartında evrim tarifi). */
  hint?: string;
}

/** Yasaklama ve tekrar kontrolü için seçeneğin kimliği: "w:magicBolt", "t:power". */
export function upgradeKey(opt: UpgradeOption): string {
  switch (opt.kind) {
    case 'weaponNew':
    case 'weaponLevel':
      return `w:${WEAPONS[opt.weapon].id}`;
    case 'tome':
      return `t:${TOMES[opt.tome].id}`;
    case 'heal':
      return 'heal';
  }
}

export interface SlotUsage {
  weapons: number;
  tomes: number;
}

/** Dolu silah ve kitap yuvası sayısı (sınır: `BALANCE.levelUp.weaponSlots/tomeSlots`). */
export function slotUsage(world: World): SlotUsage {
  return { weapons: world.weapons.length, tomes: world.tomeLevels.filter((l) => l > 0).length };
}

/** Şans yüksekse 4. kart açılır. */
export function choiceCount(luck: number): number {
  return BALANCE.levelUp.choices + (luck >= 0.45 ? 1 : 0);
}

/**
 * Seviye atlama kartlarını ağırlıklı ve tekrarsız seçer. Yasaklananlar ve `exclude` içindekiler
 * havuza girmez. Yükseltme kartları nadirlik zarı atar (Şans etkiler).
 */
export function rollUpgrades(
  world: World,
  rng: Rng,
  n: number = choiceCount(world.stats.get('luck')),
  exclude: ReadonlySet<string> = new Set(),
): UpgradeOption[] {
  const luck = world.stats.get('luck');
  const pool: { opt: UpgradeOption; weight: number }[] = [];
  const add = (opt: UpgradeOption, weight: number) => {
    const key = upgradeKey(opt);
    if (!world.banished.has(key) && !exclude.has(key)) pool.push({ opt, weight });
  };

  // Evrimleşmiş silah, temel silahın yuvasını tutmaya devam eder.
  const ownedWeapons = new Set(world.weapons.map((w) => w.def.evolvesFrom ?? w.def.id));
  for (const w of world.weapons) {
    if (w.level < weaponMaxLevel(w.def)) {
      add({ kind: 'weaponLevel', weapon: WEAPONS.indexOf(w.def), toLevel: w.level + 1, rarity: 0 }, 10);
    }
  }
  if (world.weapons.length < BALANCE.levelUp.weaponSlots) {
    WEAPONS.forEach((def, i) => {
      if (!ownedWeapons.has(def.id)) add({ kind: 'weaponNew', weapon: i }, 8);
    });
  }

  const ownedTomes = world.tomeLevels;
  const tomeCount = slotUsage(world).tomes;
  TOMES.forEach((def, i) => {
    const lvl = ownedTomes[i];
    if (lvl > 0 && lvl < def.maxLevel) {
      add({ kind: 'tome', tome: i, toLevel: lvl + 1, rarity: 0 }, def.weight * 1.2);
    } else if (lvl === 0 && tomeCount < BALANCE.levelUp.tomeSlots) {
      add({ kind: 'tome', tome: i, toLevel: 1, rarity: 0 }, def.weight);
    }
  });

  const result: UpgradeOption[] = [];
  const weights = pool.map((p) => p.weight);
  while (result.length < n) {
    const idx = rng.weightedIndex(weights);
    if (idx < 0) break;
    const opt = pool[idx].opt;
    if (opt.kind === 'weaponLevel' || opt.kind === 'tome') opt.rarity = rollRarity(rng, luck);
    result.push(opt);
    weights[idx] = 0;
  }
  if (result.length < n && !exclude.has('heal')) result.push({ kind: 'heal', amount: 30 });
  return result;
}

/** `slots` verilirse yeni silah/kitap rozetinde kaçıncı yuvaya gireceği yazar ("YENİ SİLAH · 3/4"). */
export function describeUpgrade(opt: UpgradeOption, slots?: SlotUsage): UpgradeView {
  const L = BALANCE.levelUp;
  switch (opt.kind) {
    case 'weaponNew': {
      const d = WEAPONS[opt.weapon];
      return {
        icon: d.icon,
        title: d.name,
        badge: slots ? `YENİ SİLAH · ${slots.weapons + 1}/${L.weaponSlots}` : 'YENİ SİLAH',
        description: d.description,
        rarity: null,
        rarityName: '',
      };
    }
    case 'weaponLevel': {
      const d = WEAPONS[opt.weapon];
      const evo = EVOLUTION_BY_WEAPON[d.id];
      const maxed = opt.toLevel >= weaponMaxLevel(d);
      return {
        hint: maxed && evo ? `Maks! Evrim: ${TOMES[TOME_INDEX[evo.tome]].name} + sandık` : undefined,
        icon: d.icon,
        title: d.name,
        badge: `Sv. ${opt.toLevel - 1} → ${opt.toLevel}`,
        description: describeDelta(d.levels[opt.toLevel - 2], rarityMult(opt.rarity)),
        rarity: opt.rarity,
        rarityName: RARITIES[opt.rarity].name,
      };
    }
    case 'tome': {
      const d = TOMES[opt.tome];
      return {
        icon: d.icon,
        title: d.name,
        badge:
          opt.toLevel > 1
            ? `Sv. ${opt.toLevel - 1} → ${opt.toLevel}`
            : slots
              ? `YENİ KİTAP · ${slots.tomes + 1}/${L.tomeSlots}`
              : 'YENİ KİTAP',
        description: d.describe(tomeValue(d, rarityMult(opt.rarity))),
        rarity: opt.rarity,
        rarityName: RARITIES[opt.rarity].name,
      };
    }
    case 'heal':
      return {
        icon: '🍗',
        title: 'Tavuk Budu',
        badge: 'İYİLEŞME',
        description: `${opt.amount} can yenile`,
        rarity: null,
        rarityName: '',
      };
  }
}
