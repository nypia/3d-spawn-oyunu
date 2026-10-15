import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { CHEST_CAULDRON } from '../../src/data/chests';
import { ENEMY_INDEX } from '../../src/data/enemies';
import {
  ALTAR as ALTAR_CFG,
  CAULDRON as CAULDRON_CFG,
  cauldronSouls,
  GOBLIN,
} from '../../src/data/landmarks';
import { PACTS } from '../../src/data/pacts';
import { EF_SPECIAL } from '../../src/sim/enemies/EnemyPool';
import { PICKUP_BAG, PICKUP_GOLD } from '../../src/sim/pickups/PickupPool';
import { NO_INPUT } from '../../src/sim/player/Player';
import { ALTAR, CAULDRON, CHEST } from '../../src/sim/world/Interactables';
import { World } from '../../src/sim/world/World';

const DT = BALANCE.simStep;

function arena(): World {
  const w = new World({ seed: 31, enemyCap: 0 });
  w.weapons.length = 0;
  // Goblin bu testlerde araya girmesin.
  w.landmarks.goblinAt = 1e9;
  return w;
}

function firstOf(w: World, kind: number): number {
  for (let i = 0; i < w.interactables.count; i++) if (w.interactables.kind[i] === kind) return i;
  throw new Error('yok');
}

function standAt(w: World, x: number, z: number): void {
  w.player.x = x;
  w.player.z = z;
  w.player.y = w.terrain.heightAt(x, z);
}

describe('Ruh Kazanı', () => {
  it('haritada 4 kazan ve 3 sunak var; merkezden ve birbirlerinden uzak', () => {
    const w = arena();
    const it = w.interactables;
    const spots: number[] = [];
    for (let i = 0; i < it.count; i++) if (it.kind[i] === CAULDRON || it.kind[i] === ALTAR) spots.push(i);
    expect(spots.filter((i) => it.kind[i] === CAULDRON)).toHaveLength(4);
    expect(spots.filter((i) => it.kind[i] === ALTAR)).toHaveLength(3);
    for (const i of spots) {
      expect(Math.hypot(it.x[i], it.z[i])).toBeGreaterThanOrEqual(30);
      for (const j of spots)
        if (i !== j) expect(Math.hypot(it.x[i] - it.x[j], it.z[i] - it.z[j])).toBeGreaterThanOrEqual(45);
    }
  });

  it('yakındaki ölümlerle dolar, patlar, kazan sandığı bırakır ve soğur', () => {
    const w = arena();
    const it = w.interactables;
    const k = firstOf(w, CAULDRON);
    standAt(w, it.x[k] + 20, it.z[k]);
    const need = cauldronSouls(0, 1);
    for (let n = 0; n < need - 1; n++) {
      const e = w.spawnEnemy(ENEMY_INDEX.slime, it.x[k] + 3, it.z[k]);
      w.damageEnemy(e, 1e7, 0, 0);
      w.enemies.removeDead();
    }
    expect(it.charge[k]).toBeCloseTo((need - 1) / need, 5);
    expect(w.soulFx.written).toBe(need - 1);
    // Uzaktaki ölüm sayılmaz.
    const far = w.spawnEnemy(ENEMY_INDEX.slime, it.x[k] + CAULDRON_CFG.radius + 3, it.z[k]);
    w.damageEnemy(far, 1e7, 0, 0);
    expect(it.charge[k]).toBeLessThan(1);
    const before = it.count;
    const last = w.spawnEnemy(ENEMY_INDEX.slime, it.x[k] - 2, it.z[k]);
    w.damageEnemy(last, 1e7, 0, 0);
    expect(it.charge[k]).toBe(0);
    expect(it.level[k]).toBe(1);
    expect(it.cooldown[k]).toBe(CAULDRON_CFG.cooldown);
    // Kazan sandığı: yeni (ya da yeniden kullanılan) ücretsiz sandık, kazan türünde.
    let chest = -1;
    for (let i = 0; i < it.count; i++)
      if (it.kind[i] === CHEST && it.tier[i] === CHEST_CAULDRON && !it.used[i]) chest = i;
    expect(chest).toBeGreaterThanOrEqual(0);
    expect(it.count).toBeGreaterThanOrEqual(before);
    // Soğurken ruh almaz; sonraki dolum daha çok ruh ister.
    const cold = w.spawnEnemy(ENEMY_INDEX.slime, it.x[k] + 2, it.z[k]);
    w.damageEnemy(cold, 1e7, 0, 0);
    expect(it.charge[k]).toBe(0);
    expect(cauldronSouls(1, 1)).toBeGreaterThan(need);
  });

  it('elit 8 ruh sayılır', () => {
    const w = arena();
    const it = w.interactables;
    const k = firstOf(w, CAULDRON);
    standAt(w, it.x[k] + 20, it.z[k]);
    const e = w.spawnEnemy(ENEMY_INDEX.slime, it.x[k] + 2, it.z[k], true);
    w.damageEnemy(e, 1e9, 0, 0);
    expect(it.charge[k]).toBeCloseTo(CAULDRON_CFG.eliteSouls / cauldronSouls(0, 1), 5);
  });
});

describe('Lanet Sunağı', () => {
  it('üstüne basınca iki pakt sunar; seçilen pakt güç ve lanet uygular', () => {
    const w = arena();
    const it = w.interactables;
    const a = firstOf(w, ALTAR);
    standAt(w, it.x[a], it.z[a]);
    w.step(NO_INPUT, DT);
    expect(w.reward?.kind).toBe('pact');
    if (w.reward?.kind !== 'pact') return;
    expect(w.reward.options).toHaveLength(ALTAR_CFG.choices);
    const pact = PACTS[w.reward.options[0]];
    const mods = { ...w.mods };
    const stats = new Map(
      [
        'damage',
        'maxHp',
        'critChance',
        'goldGain',
        'xpGain',
        'curse',
        'moveSpeed',
        'armor',
        'attackSpeed',
        'area',
      ].map((k) => [k, w.stats.get(k as never)]),
    );
    w.takeReward(0);
    expect(it.used[a]).toBe(1);
    expect(w.landmarks.pacts).toEqual([PACTS.indexOf(pact)]);
    for (const e of [...pact.boon, ...pact.bane]) {
      if ('stat' in e) expect(w.stats.get(e.stat)).not.toBe(stats.get(e.stat));
      else expect(w.mods[e.mod]).toBeCloseTo(mods[e.mod] * e.mult);
    }
    expect(w.player.hp).toBeLessThanOrEqual(w.player.maxHp);
  });

  it('reddedilirse uzaklaşıp dönünce aynı seçenekler gelir; alınan pakt bir daha çıkmaz', () => {
    const w = arena();
    const it = w.interactables;
    const a = firstOf(w, ALTAR);
    standAt(w, it.x[a], it.z[a]);
    w.step(NO_INPUT, DT);
    const first = w.reward?.kind === 'pact' ? [...w.reward.options] : [];
    w.takeReward(-1);
    expect(w.reward).toBeNull();
    w.step(NO_INPUT, DT);
    expect(w.reward).toBeNull();
    standAt(w, it.x[a] + ALTAR_CFG.rearmDistance + 1, it.z[a]);
    w.step(NO_INPUT, DT);
    standAt(w, it.x[a], it.z[a]);
    w.step(NO_INPUT, DT);
    expect(w.reward?.kind === 'pact' ? w.reward.options : []).toEqual(first);
    w.takeReward(1);
    // Başka bir sunak aynı paktı sunmaz.
    let other = -1;
    for (let i = 0; i < it.count; i++) if (it.kind[i] === ALTAR && i !== a) other = i;
    standAt(w, it.x[other], it.z[other]);
    w.step(NO_INPUT, DT);
    expect(w.reward?.kind === 'pact' ? w.reward.options : []).not.toContain(first[1]);
  });

  it('düşman ve iyileşme çarpanları yeni düşmanlara ve can yenilenmesine yansır', () => {
    const w = arena();
    const base = w.enemies.maxHp[w.spawnEnemy(ENEMY_INDEX.skeleton, 30, 30)];
    w.mods.enemyHp = 1.15;
    const tougher = w.enemies.maxHp[w.spawnEnemy(ENEMY_INDEX.skeleton, 30, 31)];
    expect(tougher).toBeCloseTo(base * 1.15, 3);
    w.player.hp = 50;
    w.mods.healing = 0.5;
    w.heal(20);
    expect(w.player.hp).toBe(60);
  });
});

describe('Hazine Goblini', () => {
  function goblinWorld(): { w: World; g: number } {
    const w = new World({ seed: 8, enemyCap: 0 });
    w.weapons.length = 0;
    w.time = GOBLIN.first - DT;
    w.step(NO_INPUT, DT);
    let g = -1;
    for (let i = 0; i < w.enemies.count; i++) if (w.enemies.flags[i] & EF_SPECIAL) g = i;
    return { w, g };
  }

  it('zamanında çıkar, duyurulur ve oyuncudan kaçar', () => {
    const { w, g } = goblinWorld();
    expect(g).toBeGreaterThanOrEqual(0);
    expect(w.enemies.type[g]).toBe(ENEMY_INDEX.goblin);
    expect(w.announceFx.written).toBeGreaterThan(0);
    const d0 = Math.hypot(w.enemies.x[g] - w.player.x, w.enemies.z[g] - w.player.z);
    for (let t = 0; t < 1.5; t += DT) w.step(NO_INPUT, DT);
    const d1 = Math.hypot(w.enemies.x[0] - w.player.x, w.enemies.z[0] - w.player.z);
    expect(d1).toBeGreaterThan(d0 + 3);
    expect(w.player.hp).toBe(w.player.maxHp);
  });

  it('vuruldukça altın saçar; ölünce altın yağmuru ve kese, XP ve sandık yok', () => {
    const { w, g } = goblinWorld();
    const e = w.enemies;
    const chests = w.interactables.count;
    w.damageEnemy(g, (e.maxHp[g] * 0.25) / w.stats.get('critDamage'), 0, 0);
    const drops = w.pickups.count;
    expect(drops).toBeGreaterThanOrEqual(2);
    w.damageEnemy(g, 1e9, 0, 0);
    let coins = 0;
    let bags = 0;
    for (let i = 0; i < w.pickups.count; i++) {
      if (w.pickups.kind[i] === PICKUP_GOLD) coins++;
      if (w.pickups.kind[i] === PICKUP_BAG) bags++;
    }
    expect(coins).toBeGreaterThanOrEqual(GOBLIN.deathCoins);
    expect(bags).toBe(1);
    expect(w.gems.count).toBe(0);
    expect(w.interactables.count).toBe(chests);
    expect(w.landmarks.goblinsCaught).toBe(1);
  });

  it('süresi dolunca kaybolur (öldürme sayılmaz)', () => {
    const { w } = goblinWorld();
    for (let t = 0; t < GOBLIN.life + 0.5; t += DT) {
      w.player.x = 0;
      w.player.z = 0;
      w.step(NO_INPUT, DT);
    }
    let alive = 0;
    for (let i = 0; i < w.enemies.count; i++) if (w.enemies.flags[i] & EF_SPECIAL) alive++;
    expect(alive).toBe(0);
    expect(w.kills).toBe(0);
  });
});
