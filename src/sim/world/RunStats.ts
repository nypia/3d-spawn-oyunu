import { BOSSES } from '../../data/bosses';
import { ITEMS } from '../../data/items';
import { PACTS } from '../../data/pacts';
import { TOMES } from '../../data/tomes';
import { weaponMaxLevel } from '../../data/weapons';
import type { World } from './World';

/** En fazla izlenen silah yuvası (yuva sınırı 4; kalıcı güçlerle artabilir). */
export const MAX_WEAPON_SLOTS = 8;

/** Koşu nasıl bitti: öldü, finali yenip bitirdi, menüye döndü. */
export type RunOutcome = 'death' | 'victory' | 'quit';

/**
 * Koşu boyunca tutulan istatistikler (oyun sonu özeti). Hasar ve öldürmeler kaynağa göre: silah
 * yuvası (World.dmgSrc) ya da "diğer" (eşya patlamaları, dikenler, kazan, kayma).
 */
export class RunStats {
  readonly weaponDamage = new Float64Array(MAX_WEAPON_SLOTS);
  readonly weaponKills = new Uint32Array(MAX_WEAPON_SLOTS);
  /** Silahın alındığı an (DPS için). */
  readonly weaponSince = new Float64Array(MAX_WEAPON_SLOTS);
  otherDamage = 0;
  otherKills = 0;
  goldEarned = 0;
  damageTaken = 0;
  evolutions = 0;

  addDamage(src: number, dmg: number): void {
    if (src >= 0 && src < MAX_WEAPON_SLOTS) this.weaponDamage[src] += dmg;
    else this.otherDamage += dmg;
  }

  addKill(src: number): void {
    if (src >= 0 && src < MAX_WEAPON_SLOTS) this.weaponKills[src]++;
    else this.otherKills++;
  }
}

export interface WeaponSummary {
  icon: string;
  name: string;
  level: number;
  maxed: boolean;
  evolved: boolean;
  damage: number;
  /** Toplam hasardaki payı (0..1). */
  share: number;
  kills: number;
  dps: number;
}

export interface RunSummary {
  outcome: RunOutcome;
  time: number;
  cycle: number;
  level: number;
  kills: number;
  eliteKills: number;
  /** Öldürülen boss adları ve BOSSES indeksleri (sırayla). */
  bosses: string[];
  bossIndices: number[];
  victories: number;
  damage: number;
  /** Hasara göre azalan silahlar. */
  weapons: WeaponSummary[];
  otherDamage: number;
  tomes: { icon: string; name: string; level: number }[];
  items: { icon: string; name: string; count: number }[];
  pacts: { icon: string; name: string }[];
  goldEarned: number;
  goldLeft: number;
  chestsOpened: number;
  goblins: number;
  damageTaken: number;
}

/** Oyun sonu ve zafer ekranları için koşunun özeti (saf: dünyayı değiştirmez). */
export function summarizeRun(w: World): RunSummary {
  const r = w.run;
  const total = r.otherDamage + w.weapons.reduce((a, _, k) => a + r.weaponDamage[k], 0);
  const weapons = w.weapons
    .map((inst, k): WeaponSummary => {
      const dmg = r.weaponDamage[k];
      const held = Math.max(1, w.time - r.weaponSince[k]);
      return {
        icon: inst.def.icon,
        name: inst.def.name,
        level: inst.level,
        maxed: inst.level >= weaponMaxLevel(inst.def),
        evolved: !!inst.def.evolvesFrom,
        damage: dmg,
        share: total > 0 ? dmg / total : 0,
        kills: r.weaponKills[k],
        dps: dmg / held,
      };
    })
    .sort((a, b) => b.damage - a.damage);
  return {
    outcome: w.outcome ?? 'death',
    time: w.time,
    cycle: w.cycle,
    level: w.level,
    kills: w.kills,
    eliteKills: w.eliteKills,
    bosses: w.bosses.killedIndex.map((i) => BOSSES[i]?.name ?? '?'),
    bossIndices: [...w.bosses.killedIndex],
    victories: w.victories,
    damage: w.damageDealt,
    weapons,
    otherDamage: r.otherDamage,
    tomes: TOMES.flatMap((d, i) =>
      w.tomeLevels[i] > 0 ? [{ icon: d.icon, name: d.name, level: w.tomeLevels[i] }] : [],
    ),
    items: ITEMS.flatMap((d, i) =>
      w.itemCounts[i] > 0 ? [{ icon: d.icon, name: d.name, count: w.itemCounts[i] }] : [],
    ),
    pacts: w.landmarks.pacts.map((k) => ({ icon: PACTS[k].icon, name: PACTS[k].name })),
    goldEarned: r.goldEarned,
    goldLeft: w.gold,
    chestsOpened: w.chestsOpened,
    goblins: w.landmarks.goblinsCaught,
    damageTaken: r.damageTaken,
  };
}
