import type { LoadoutEffect } from '../../data/effects';
import { HERO_BY_ID } from '../../data/heroes';
import { META_UPGRADES } from '../../data/metaUpgrades';
import type { World } from '../world/World';

/**
 * Koşunun başlangıç donanımı: seçilen kahraman ve kalıcı güçlerin rank'leri. World yalnızca bu düz
 * veriyi alır (depolamaya dokunmaz): aynı seed + aynı loadout = aynı koşu.
 */
export interface RunLoadout {
  hero?: string;
  upgrades?: Readonly<Record<string, number>>;
}

function apply(w: World, e: LoadoutEffect, times: number): void {
  if (times <= 0) return;
  if ('stat' in e) {
    if (e.mode === 'flat') w.stats.addFlat(e.stat, e.value * times);
    else w.stats.addMult(e.stat, e.value * times);
  } else if ('charge' in e) w[e.charge] += e.value * times;
  else w.gold += e.gold * times;
}

/** Kahraman pasifini ve güç rank'lerini uygular; kahramanın başlangıç silahını döner. */
export function applyLoadout(w: World, l: RunLoadout): string | undefined {
  const hero = l.hero ? HERO_BY_ID[l.hero] : undefined;
  if (hero) for (const e of hero.passive) apply(w, e, 1);
  for (const def of META_UPGRADES) {
    const rank = Math.max(0, Math.min(def.costs.length, Math.floor(l.upgrades?.[def.id] ?? 0)));
    for (const e of def.effects) apply(w, e, rank);
  }
  return hero?.weapon;
}
