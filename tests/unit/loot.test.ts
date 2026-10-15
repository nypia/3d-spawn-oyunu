import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { ENEMY_INDEX } from '../../src/data/enemies';
import { ITEM_INDEX } from '../../src/data/items';
import { PICKUP_GOLD, PICKUP_HEAL, PICKUP_MAGNET } from '../../src/sim/pickups/PickupPool';
import { NO_INPUT } from '../../src/sim/player/Player';
import { CHEST, VASE } from '../../src/sim/world/Interactables';
import { World } from '../../src/sim/world/World';

const DT = BALANCE.simStep;

function arena(): World {
  const w = new World({ seed: 31, enemyCap: 0 });
  w.weapons.length = 0;
  return w;
}

/** Oyuncuyu i. etkileşimli nesnenin üstüne koyar. */
function stand(w: World, i: number): void {
  const it = w.interactables;
  w.player.x = it.x[i];
  w.player.z = it.z[i];
  w.player.y = w.terrain.heightAt(it.x[i], it.z[i]);
}

function firstOf(w: World, kind: number): number {
  for (let i = 0; i < w.interactables.count; i++) if (w.interactables.kind[i] === kind) return i;
  throw new Error('yok');
}

describe('ganimet', () => {
  it('harita vazo, sandık, Ruh Kazanı ve Lanet Sunağı içerir', () => {
    const w = arena();
    const kinds = new Set(Array.from(w.interactables.kind.subarray(0, w.interactables.count)));
    expect(kinds.size).toBe(4);
  });

  it('altın yetmezse sandık açılmaz', () => {
    const w = arena();
    const c = firstOf(w, CHEST);
    stand(w, c);
    w.step(NO_INPUT, DT);
    expect(w.interactables.used[c]).toBe(0);
    expect(w.reward).toBeNull();
  });

  it('sandık altını düşer, fiyat artar ve eşya ödülü gelir', () => {
    const w = arena();
    const c = firstOf(w, CHEST);
    w.gold = 100;
    stand(w, c);
    w.step(NO_INPUT, DT);
    expect(w.interactables.used[c]).toBe(1);
    expect(w.gold).toBe(100 - BALANCE.loot.chestBasePrice);
    expect(w.chestPrice).toBe(Math.round(BALANCE.loot.chestBasePrice * BALANCE.loot.chestPriceGrowth));
    expect(w.reward?.kind).toBe('item');
    expect(w.paused).toBe(true);
    const item = w.reward?.kind === 'item' ? w.reward.items[0].item : -1;
    w.takeReward();
    expect(w.itemCounts[item]).toBe(1);
    expect(w.paused).toBe(false);
  });

  it('elit ölünce ücretsiz ödül sandığı düşer', () => {
    const w = arena();
    const before = w.interactables.count;
    const i = w.spawnEnemy(ENEMY_INDEX.skeleton, w.player.x + 10, w.player.z, true);
    w.damageEnemy(i, 1e7, 0, 0);
    expect(w.interactables.count).toBe(before + 1);
    expect(w.interactables.kind[before]).toBe(CHEST);
    expect(w.interactables.free[before]).toBe(1);
    stand(w, before);
    w.step(NO_INPUT, DT);
    expect(w.reward).not.toBeNull();
    // Ücretsiz: altın harcanmaz, fiyat artmaz.
    expect(w.chestPrice).toBe(BALANCE.loot.chestBasePrice);
  });

  it('vazo kırılınca altın düşer ve toplanır', () => {
    const w = arena();
    const v = firstOf(w, VASE);
    stand(w, v);
    w.step(NO_INPUT, DT);
    expect(w.interactables.used[v]).toBe(1);
    let gold = 0;
    for (let i = 0; i < w.pickups.count; i++) if (w.pickups.kind[i] === PICKUP_GOLD) gold++;
    expect(gold).toBeGreaterThan(0);
    for (let t = 0; t < 1.5; t += DT) w.step(NO_INPUT, DT);
    expect(w.gold).toBeGreaterThan(0);
  });

  it('mıknatıs tüm XP taşlarını çeker', () => {
    const w = arena();
    const p = w.player;
    w.gems.add(p.x + 40, p.y, p.z, 1, p.x, p.z);
    w.dropPickup(PICKUP_MAGNET, p.x, p.y + 0.5, p.z, 1);
    for (let t = 0; t < 4; t += DT) w.step(NO_INPUT, DT);
    expect(w.gems.count).toBe(0);
    expect(w.xp).toBeGreaterThan(0);
  });

  it('mıknatıs uzaktaki altını da çeker, canı çekmez', () => {
    const w = arena();
    const p = w.player;
    w.pickups.add(PICKUP_GOLD, p.x + 40, p.y + 0.3, p.z, 5);
    w.pickups.add(PICKUP_HEAL, p.x - 40, p.y + 0.3, p.z, 1);
    w.dropPickup(PICKUP_MAGNET, p.x, p.y + 0.5, p.z, 1);
    for (let t = 0; t < 4; t += DT) w.step(NO_INPUT, DT);
    expect(w.gold).toBeGreaterThanOrEqual(5);
    expect(w.pickups.count).toBe(1);
    expect(w.pickups.kind[0]).toBe(PICKUP_HEAL);
  });

  it('attract yalnızca yarıçap içindekileri çeker', () => {
    const w = arena();
    const p = w.player;
    w.gems.add(p.x + 10, p.y, p.z, 1, p.x, p.z);
    w.gems.add(p.x + 30, p.y, p.z, 1, p.x, p.z);
    w.attract(15);
    expect(w.gems.pull[0]).toBeGreaterThan(0);
    expect(w.gems.pull[1]).toBe(0);
  });

  it('elitler sık sık mıknatıs düşürür', () => {
    const w = arena();
    for (let k = 0; k < 40; k++) {
      const i = w.spawnEnemy(ENEMY_INDEX.skeleton, w.player.x + 20, w.player.z + k, true);
      w.damageEnemy(i, 1e7, 0, 0);
      w.enemies.removeDead();
    }
    let magnets = 0;
    for (let i = 0; i < w.pickups.count; i++) if (w.pickups.kind[i] === PICKUP_MAGNET) magnets++;
    expect(magnets).toBeGreaterThan(10);
    expect(magnets).toBeLessThan(32);
  });
});

describe('eşyalar', () => {
  it('Tüy çift zıplama verir', () => {
    const w = arena();
    w.applyItem(ITEM_INDEX.feather);
    expect(w.stats.get('jumpCount')).toBe(2);
  });

  it('Kalkan Muskası ilk vuruşu engeller', () => {
    const w = arena();
    w.applyItem(ITEM_INDEX.amulet);
    const hp = w.player.hp;
    expect(w.hurtPlayer(30)).toBe(0);
    expect(w.player.hp).toBe(hp);
    expect(w.hurtPlayer(30)).toBeGreaterThan(0);
    expect(w.player.hp).toBeLessThan(hp);
  });

  it('Lanetli Taç spawn yoğunluğunu artırır', () => {
    const a = new World({ seed: 7 });
    const b = new World({ seed: 7 });
    b.applyItem(ITEM_INDEX.crown);
    a.weapons.length = 0;
    b.weapons.length = 0;
    for (let t = 0; t < 20; t += DT) {
      a.step(NO_INPUT, DT);
      b.step(NO_INPUT, DT);
    }
    expect(b.enemies.count).toBeGreaterThan(a.enemies.count);
  });

  it('Patlayan Kafatası öldürmelerde patlama kuyruğa alır', () => {
    const w = arena();
    w.applyItem(ITEM_INDEX.skull);
    for (let k = 0; k < 100; k++) {
      const i = w.spawnEnemy(0, w.player.x + 30, w.player.z + k * 0.1);
      w.damageEnemy(i, 1e6, 0, 0);
    }
    expect(w.blasts.count).toBeGreaterThan(0);
  });
});
