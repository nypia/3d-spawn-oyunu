import type { Rng } from '../../core/Rng';
import { BALANCE } from '../../data/balance';
import { TOMES } from '../../data/tomes';
import { WEAPONS, weaponMaxLevel } from '../../data/weapons';
import type { World } from '../world/World';

export type UpgradeOption =
  | { kind: 'weaponNew'; weapon: number }
  | { kind: 'weaponLevel'; weapon: number; toLevel: number }
  | { kind: 'tome'; tome: number; toLevel: number }
  | { kind: 'heal'; amount: number };

export interface UpgradeView {
  icon: string;
  title: string;
  badge: string;
  description: string;
}

/** Seviye atlama kartlarını ağırlıklı ve tekrarsız olarak seçer. */
export function rollUpgrades(world: World, rng: Rng, n: number = BALANCE.levelUp.choices): UpgradeOption[] {
  const pool: { opt: UpgradeOption; weight: number }[] = [];

  const ownedWeapons = new Set(world.weapons.map((w) => w.def.id));
  for (const w of world.weapons) {
    if (w.level < weaponMaxLevel(w.def)) {
      pool.push({
        opt: { kind: 'weaponLevel', weapon: WEAPONS.indexOf(w.def), toLevel: w.level + 1 },
        weight: 10,
      });
    }
  }
  if (world.weapons.length < BALANCE.levelUp.weaponSlots) {
    WEAPONS.forEach((def, i) => {
      if (!ownedWeapons.has(def.id)) pool.push({ opt: { kind: 'weaponNew', weapon: i }, weight: 8 });
    });
  }

  const ownedTomes = world.tomeLevels;
  const tomeCount = ownedTomes.filter((l) => l > 0).length;
  TOMES.forEach((def, i) => {
    const lvl = ownedTomes[i];
    if (lvl > 0 && lvl < def.maxLevel) {
      pool.push({ opt: { kind: 'tome', tome: i, toLevel: lvl + 1 }, weight: def.weight * 1.2 });
    } else if (lvl === 0 && tomeCount < BALANCE.levelUp.tomeSlots) {
      pool.push({ opt: { kind: 'tome', tome: i, toLevel: 1 }, weight: def.weight });
    }
  });

  const result: UpgradeOption[] = [];
  const weights = pool.map((p) => p.weight);
  while (result.length < n) {
    const idx = rng.weightedIndex(weights);
    if (idx < 0) break;
    result.push(pool[idx].opt);
    weights[idx] = 0;
  }
  if (result.length < n) result.push({ kind: 'heal', amount: 30 });
  return result;
}

export function describeUpgrade(opt: UpgradeOption): UpgradeView {
  switch (opt.kind) {
    case 'weaponNew': {
      const d = WEAPONS[opt.weapon];
      return { icon: d.icon, title: d.name, badge: 'YENİ SİLAH', description: d.description };
    }
    case 'weaponLevel': {
      const d = WEAPONS[opt.weapon];
      return {
        icon: d.icon,
        title: d.name,
        badge: `Sv. ${opt.toLevel - 1} → ${opt.toLevel}`,
        description: d.levels[opt.toLevel - 2].desc,
      };
    }
    case 'tome': {
      const d = TOMES[opt.tome];
      return {
        icon: d.icon,
        title: d.name,
        badge: opt.toLevel === 1 ? 'YENİ KİTAP' : `Sv. ${opt.toLevel - 1} → ${opt.toLevel}`,
        description: d.describe(d.perLevel),
      };
    }
    case 'heal':
      return { icon: '🍗', title: 'Tavuk Budu', badge: 'İYİLEŞME', description: `${opt.amount} can yenile` };
  }
}
