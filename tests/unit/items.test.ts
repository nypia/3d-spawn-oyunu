import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { ENEMY_INDEX } from '../../src/data/enemies';
import { ITEM_FX, ITEM_INDEX, ITEMS } from '../../src/data/items';
import { WEAPON_INDEX, WEAPONS } from '../../src/data/weapons';
import { PICKUP_GOLD } from '../../src/sim/pickups/PickupPool';
import { NO_INPUT } from '../../src/sim/player/Player';
import { createWeapon } from '../../src/sim/weapons/Weapons';
import { World } from '../../src/sim/world/World';

const DT = BALANCE.simStep;

function arena(): World {
  const w = new World({ seed: 31, enemyCap: 0 });
  w.weapons.length = 0;
  return w;
}

/** Ölümsüz, kıpırdamayan hedef. */
function dummy(w: World, dx: number, dz = 0, type = ENEMY_INDEX.skeleton): number {
  const i = w.spawnEnemy(type, w.player.x + dx, w.player.z + dz);
  w.enemies.hp[i] = 1e6;
  return i;
}

describe('eşya kataloğu', () => {
  it('14 eşya, her nadirlikte en az iki eşya ve benzersiz kimlikler', () => {
    expect(ITEMS).toHaveLength(14);
    expect(new Set(ITEMS.map((d) => d.id)).size).toBe(14);
    for (const r of [0, 1, 2, 3])
      expect(ITEMS.filter((d) => d.rarity === r).length).toBeGreaterThanOrEqual(2);
  });

  it('sandık zarı her nadirlikten eşya verebilir', () => {
    const w = arena();
    w.stats.addFlat('luck', 2);
    const seen = new Set<number>();
    for (let k = 0; k < 400; k++) seen.add(ITEMS[w.rollItem().item].rarity);
    expect(seen.size).toBe(4);
  });
});

describe('yeni eşyalar', () => {
  it('Bandaj seviye atlayınca can verir', () => {
    const w = arena();
    w.applyItem(ITEM_INDEX.bandage);
    w.player.hp = 50;
    w.addXp(w.xpNext);
    expect(w.player.hp).toBe(50 + ITEM_FX.bandageHeal);
  });

  it('Mıknatıs Taşı yakındaki XP ve altını aralıklarla çeker', () => {
    const w = arena();
    const p = w.player;
    w.applyItem(ITEM_INDEX.lodestone);
    w.gems.add(p.x + 10, p.y, p.z, 1, p.x, p.z);
    w.gems.add(p.x + 30, p.y, p.z, 1, p.x, p.z);
    w.pickups.add(PICKUP_GOLD, p.x - 12, p.y, p.z, 1);
    w.step(NO_INPUT, DT);
    expect(w.pickups.pull[0]).toBeGreaterThan(0);
    expect(w.pulseFx.written).toBe(1);
    // Uzaktaki taş çekilmedi; bekleme süresi dolmadan yeni çekiş olmaz.
    for (let t = 0; t < 5; t += DT) w.step(NO_INPUT, DT);
    expect(w.gems.count).toBe(1);
    expect(w.pulseFx.written).toBe(1);
    expect(w.lodestoneTimer).toBeGreaterThan(ITEM_FX.lodestoneCooldown - 6);
  });

  it('Keskin Göz kritik şansını ve hasarını artırır', () => {
    const w = arena();
    const chance = w.stats.get('critChance');
    const dmg = w.stats.get('critDamage');
    w.applyItem(ITEM_INDEX.eye);
    expect(w.stats.get('critChance')).toBeCloseTo(chance + 0.1);
    expect(w.stats.get('critDamage')).toBeCloseTo(dmg + 0.25);
  });

  it('Roket Çizme: kayarken çarptığın düşman hasar alır, sen almazsın', () => {
    const run = (rocket: boolean) => {
      const w = arena();
      if (rocket) w.applyItem(ITEM_INDEX.rocket);
      const slide = { moveX: 1, moveZ: 0, jump: false, slide: true };
      for (let k = 0; k < 5; k++) w.step(slide, DT);
      expect(w.player.sliding).toBe(true);
      const i = dummy(w, 0.4);
      const hp = w.player.hp;
      w.step(slide, DT);
      return { playerLost: hp - w.player.hp, enemyHit: w.enemies.hp[i] < 1e6 };
    };
    const withRocket = run(true);
    expect(withRocket.enemyHit).toBe(true);
    expect(withRocket.playerLost).toBeLessThanOrEqual(0);
    const without = run(false);
    expect(without.playerLost).toBeGreaterThan(0);
  });

  it('Buz Kristali vuruşlarla düşmanı dondurur; donmuş düşman yürümez ve vurmaz', () => {
    const w = arena();
    for (let k = 0; k < 4; k++) w.applyItem(ITEM_INDEX.frost);
    const i = dummy(w, 5);
    for (let k = 0; k < 60 && w.enemies.frozen[i] === 0; k++) w.damageEnemy(i, 0.001, 0, 0);
    expect(w.enemies.frozen[i]).toBeGreaterThan(0);
    const x = w.enemies.x[i];
    w.step(NO_INPUT, DT);
    expect(w.enemies.x[i]).toBeCloseTo(x, 3);

    // Oyuncunun içindeki donmuş düşman temas hasarı vermez.
    const j = dummy(w, 0.3);
    w.freezeEnemy(j, 2);
    const hp = w.player.hp;
    for (let k = 0; k < 30; k++) w.step(NO_INPUT, DT);
    expect(w.player.hp).toBeGreaterThanOrEqual(hp);
  });

  it('Anka Tüyü bir kez diriltir, sonra oyun biter', () => {
    const w = arena();
    w.applyItem(ITEM_INDEX.phoenix);
    w.player.hp = -5;
    w.step(NO_INPUT, DT);
    expect(w.gameOver).toBe(false);
    expect(w.player.hp).toBeCloseTo(w.player.maxHp * ITEM_FX.phoenixHp, 0);
    expect(w.itemCounts[ITEM_INDEX.phoenix]).toBe(0);
    expect(w.player.invuln).toBeGreaterThan(0);
    expect(w.revivedAt).toBeGreaterThanOrEqual(0);
    expect(w.blasts.count).toBe(1);
    expect(w.hurtPlayer(50)).toBe(0);

    w.player.invuln = 0;
    w.player.hp = -1;
    w.step(NO_INPUT, DT);
    expect(w.gameOver).toBe(true);
  });

  it('Yankı Yüzüğü silahları ek atış yaptırır', () => {
    const shots = (rings: number) => {
      const w = arena();
      w.weapons.push(createWeapon(WEAPONS[WEAPON_INDEX.magicBolt]));
      for (let k = 0; k < rings; k++) w.applyItem(ITEM_INDEX.echo);
      const i = dummy(w, 8, 0, ENEMY_INDEX.golem);
      w.enemies.speed[i] = 0;
      let n = 0;
      const spawn = w.spawnProjectile.bind(w);
      w.spawnProjectile = (o) => {
        n++;
        spawn(o);
      };
      for (let t = 0; t < 20; t += DT) w.step(NO_INPUT, DT);
      return n;
    };
    expect(shots(3)).toBeGreaterThan(shots(0) * 1.3);
  });
});
