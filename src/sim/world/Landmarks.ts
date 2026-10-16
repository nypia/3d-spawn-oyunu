import { CHEST_CAULDRON } from '../../data/chests';
import { ENEMY_INDEX } from '../../data/enemies';
import { ALTAR, CAULDRON, cauldronSouls, GOBLIN } from '../../data/landmarks';
import { PACTS } from '../../data/pacts';
import { EF_BOSS, EF_NOLOOT, EF_SPECIAL, EF_SUMMON } from '../enemies/EnemyPool';
import { PICKUP_BAG, PICKUP_GOLD } from '../pickups/PickupPool';
import { ANN_CAULDRON, ANN_GOBLIN, ANN_GOBLIN_ESCAPE, ANN_PACT } from './announce';
import { ALTAR as ALTAR_KIND, CAULDRON as CAULDRON_KIND, CHEST as CHEST_KIND } from './Interactables';
import type { World } from './World';

/** goblinFx kodları: x,y,z,kod */
export const GOBLIN_SPAWN = 0;
export const GOBLIN_DROP = 1;
export const GOBLIN_DEATH = 2;
export const GOBLIN_ESCAPE = 3;

/**
 * Tapınağın yerine gelen mekanikler: Ruh Kazanı (ruh topla → patlat → kazan sandığı), Lanet Sunağı
 * (güç + kalıcı lanet paktı) ve Hazine Goblini (kaçan altın kesesi). Durum burada, kurallar World'ün
 * genel yardımcılarını (hasar, sandık, ödül) kullanır.
 */
export class Landmarks {
  /** Bir sonraki goblinin çıkacağı an (s). */
  goblinAt: number = GOBLIN.first;
  goblinsCaught = 0;
  /** Sunak indeksi → sunulan pakt seçenekleri (reddedilip dönülünce aynıları gelir). */
  readonly altarOptions = new Map<number, number[]>();
  /** Alınan paktlar (PACTS indeksleri). */
  readonly pacts: number[] = [];

  update(w: World, dt: number): void {
    const it = w.interactables;
    const p = w.player;
    for (let i = 0; i < it.count; i++) {
      const kind = it.kind[i];
      if (kind === CAULDRON_KIND) {
        if (it.cooldown[i] > 0) it.cooldown[i] = Math.max(0, it.cooldown[i] - dt);
      } else if (kind === ALTAR_KIND && !it.used[i]) {
        const d2 = (it.x[i] - p.x) ** 2 + (it.z[i] - p.z) ** 2;
        if (it.level[i]) {
          // Reddedildi: oyuncu uzaklaşınca yeniden etkinleşir.
          if (d2 > ALTAR.rearmDistance ** 2) it.level[i] = 0;
        } else if (
          d2 < ALTAR.radius ** 2 &&
          !w.reward &&
          Math.abs(p.y - w.terrain.heightAt(it.x[i], it.z[i])) < 2
        ) {
          w.pushReward({ kind: 'pact', altar: i, options: this.optionsFor(w, i) });
        }
      }
    }
    this.updateGoblin(w);
  }

  private optionsFor(w: World, altar: number): number[] {
    let opts = this.altarOptions.get(altar);
    if (!opts) {
      const weights = PACTS.map((_, k) => (this.pacts.includes(k) ? 0 : 1));
      opts = [];
      for (let k = 0; k < ALTAR.choices; k++) {
        const pick = w.rng.weightedIndex(weights);
        if (pick < 0) break;
        weights[pick] = 0;
        opts.push(pick);
      }
      this.altarOptions.set(altar, opts);
    }
    return opts;
  }

  /** Pakt seçildi (choice ≥ 0) ya da reddedildi (−1). */
  takePact(w: World, altar: number, options: readonly number[], choice: number): void {
    const it = w.interactables;
    const pact = options[choice];
    if (choice < 0 || pact === undefined) {
      it.level[altar] = 1;
      return;
    }
    it.used[altar] = 1;
    this.altarOptions.delete(altar);
    this.pacts.push(pact);
    const def = PACTS[pact];
    for (const e of [...def.boon, ...def.bane]) {
      if ('stat' in e) {
        if (e.mode === 'mult') w.stats.addMult(e.stat, e.value);
        else w.stats.addFlat(e.stat, e.value);
      } else {
        w.mods[e.mod] *= e.mult;
      }
    }
    const p = w.player;
    p.maxHp = w.stats.get('maxHp');
    p.hp = Math.min(p.hp, p.maxHp);
    const y = w.terrain.heightAt(it.x[altar], it.z[altar]);
    w.breakFx.push(it.x[altar], y, it.z[altar], ALTAR_KIND, 0);
    w.announceFx.push(ANN_PACT, pact, 0);
  }

  /**
   * Kan Ayı: kazanlar, sunaklar ve haritadaki ücretli sandıklar yeniden kullanılabilir (fiyat artmaya
   * devam eder: geç oyunda da altının bir karşılığı olsun).
   */
  rearm(w: World): void {
    const it = w.interactables;
    for (let i = 0; i < it.count; i++) {
      if (it.kind[i] === CHEST_KIND && !it.free[i]) {
        it.used[i] = 0;
      } else if (it.kind[i] === ALTAR_KIND) {
        it.used[i] = 0;
        it.level[i] = 0;
      } else if (it.kind[i] === CAULDRON_KIND) {
        it.cooldown[i] = 0;
      }
    }
  }

  // ------------------------------------------------------------------ Ruh Kazanı

  /** Ölen düşmanın ruhu: yakındaki kazanı doldurur. */
  feed(w: World, i: number): void {
    const e = w.enemies;
    const flags = e.flags[i];
    if (flags & EF_NOLOOT) return;
    const souls = flags & EF_BOSS ? CAULDRON.bossSouls : e.elite[i] ? CAULDRON.eliteSouls : 1;
    const value = flags & EF_SUMMON ? souls * CAULDRON.summonSouls : souls;
    const it = w.interactables;
    const r2 = CAULDRON.radius ** 2;
    for (let k = 0; k < it.count; k++) {
      if (it.kind[k] !== CAULDRON_KIND || it.cooldown[k] > 0) continue;
      if ((it.x[k] - e.x[i]) ** 2 + (it.z[k] - e.z[i]) ** 2 > r2) continue;
      it.charge[k] += value / cauldronSouls(it.level[k], w.cycle);
      w.soulFx.push(e.x[i], e.y[i] + e.hover[i] + 0.8, e.z[i], k, value);
      // Float32 birikimi tam 1'e varmayabilir: küçük tolerans.
      if (it.charge[k] >= 1 - 1e-4) this.erupt(w, k);
      return;
    }
  }

  private erupt(w: World, k: number): void {
    const it = w.interactables;
    const x = it.x[k];
    const z = it.z[k];
    const y = w.terrain.heightAt(x, z);
    it.charge[k] = 0;
    it.level[k] = Math.min(250, it.level[k] + 1);
    it.cooldown[k] = CAULDRON.cooldown;
    // Kazan patlaması "diğer" hasar sayılır (bir silah öldürürken tetiklenmiş olsa da).
    const src = w.dmgSrc;
    w.dmgSrc = -1;
    w.damageInRadius(x, y + 1, z, CAULDRON.eruptRadius, CAULDRON.eruptDamage, CAULDRON.eruptKnock);
    w.dmgSrc = src;
    w.breakFx.push(x, y, z, CAULDRON_KIND, 0);
    const a = w.rng.range(0, Math.PI * 2);
    w.interactables.addRewardChest(x + Math.sin(a) * 2.6, z + Math.cos(a) * 2.6, a, CHEST_CAULDRON);
    w.announceFx.push(ANN_CAULDRON, k, 0);
  }

  // ------------------------------------------------------------------ Hazine Goblini

  private updateGoblin(w: World): void {
    if (w.time < this.goblinAt) return;
    const e = w.enemies;
    // Boss varken ya da önceki goblin hâlâ ortadayken ertele.
    for (let i = 0; i < e.count; i++) {
      if (!e.dead[i] && e.flags[i] & (EF_BOSS | EF_SPECIAL)) {
        this.goblinAt = w.time + 10;
        return;
      }
    }
    this.goblinAt = w.time + w.rng.range(GOBLIN.intervalMin, GOBLIN.intervalMax);
    const p = w.player;
    const a = w.rng.range(0, Math.PI * 2);
    const x = w.terrain.clampToPlayable(p.x + Math.sin(a) * GOBLIN.spawnDist);
    const z = w.terrain.clampToPlayable(p.z + Math.cos(a) * GOBLIN.spawnDist);
    const i = w.spawnEnemy(ENEMY_INDEX.goblin, x, z, false, { flags: EF_SPECIAL | EF_NOLOOT });
    if (i < 0) return;
    e.timer[i] = GOBLIN.life;
    e.ax[i] = 1 - GOBLIN.dropStep;
    e.az[i] = 0;
    w.goblinFx.push(x, e.y[i], z, GOBLIN_SPAWN);
    w.announceFx.push(ANN_GOBLIN, 0, 0);
  }

  /** Goblin hareketi: kaçar; uzaktaysa yavaşlayıp kışkırtır, vurulunca hızlanır. Kaçarsa false döner. */
  goblinMove(w: World, i: number, dist: number, dt: number): boolean {
    const e = w.enemies;
    e.timer[i] -= dt;
    e.az[i] = Math.max(0, e.az[i] - dt);
    if (e.timer[i] <= 0 || dist > GOBLIN.escapeDist) {
      e.dead[i] = 1;
      w.goblinFx.push(e.x[i], e.y[i], e.z[i], GOBLIN_ESCAPE);
      w.announceFx.push(ANN_GOBLIN_ESCAPE, 0, 0);
      return false;
    }
    return true;
  }

  /** Hız çarpanı (panik / kışkırtma). */
  goblinSpeed(w: World, i: number, dist: number): number {
    const e = w.enemies;
    if (e.az[i] > 0) return GOBLIN.panicMul;
    return dist > GOBLIN.tauntDist ? GOBLIN.tauntMul : 1;
  }

  /** Vuruldu: canının her %8'inde altın saçar, kısa süre panikler. */
  goblinHit(w: World, i: number): void {
    const e = w.enemies;
    e.az[i] = GOBLIN.panicTime;
    const frac = e.hp[i] / e.maxHp[i];
    const y = e.y[i] + 0.6;
    let guard = 20;
    while (frac < e.ax[i] && e.ax[i] > 0 && guard-- > 0) {
      e.ax[i] -= GOBLIN.dropStep;
      w.dropPickup(PICKUP_GOLD, e.x[i], y, e.z[i], GOBLIN.dropValue);
      w.goblinFx.push(e.x[i], y, e.z[i], GOBLIN_DROP);
    }
  }

  /** Yakalandı: altın yağmuru + kese. Sandık, XP ve ruh yok. */
  goblinDeath(w: World, i: number): void {
    const e = w.enemies;
    const y = w.terrain.heightAt(e.x[i], e.z[i]) + 0.4;
    for (let c = 0; c < GOBLIN.deathCoins; c++)
      w.dropPickup(PICKUP_GOLD, e.x[i], y, e.z[i], GOBLIN.deathCoinValue);
    w.dropPickup(PICKUP_BAG, e.x[i], y + 0.2, e.z[i], GOBLIN.deathBag);
    w.goblinFx.push(e.x[i], y, e.z[i], GOBLIN_DEATH);
    this.goblinsCaught++;
  }
}
