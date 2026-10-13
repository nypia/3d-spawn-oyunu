import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { WEAPON_INDEX, WEAPONS } from '../../src/data/weapons';
import { PF_RETURNING, PROJ_AXE, PROJ_PELLET } from '../../src/sim/combat/ProjectilePool';
import { NO_INPUT } from '../../src/sim/player/Player';
import { createWeapon } from '../../src/sim/weapons/Weapons';
import { World } from '../../src/sim/world/World';

const DT = BALANCE.simStep;

/** Tek silahlı, spawn'sız bir test dünyası; düşmanlar sabit durur. */
function arena(weaponId: string): World {
  const w = new World({ seed: 11, enemyCap: 0 });
  w.weapons.length = 0;
  w.weapons.push(createWeapon(WEAPONS[WEAPON_INDEX[weaponId]]));
  return w;
}

function place(w: World, dx: number, dz: number, hp = 1000): number {
  const p = w.player;
  const i = w.spawnEnemy(0, p.x + dx, p.z + dz);
  w.enemies.speed[i] = 0;
  w.enemies.hp[i] = w.enemies.maxHp[i] = hp;
  return w.enemies.uid[i];
}

function hpOf(w: World, uid: number): number {
  const e = w.enemies;
  for (let i = 0; i < e.count; i++) if (e.uid[i] === uid) return e.hp[i];
  return Number.NaN;
}

function run(w: World, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) w.step(NO_INPUT, DT);
}

describe('silahlar', () => {
  it('Kılıç önündekine vurur, arkasındakine vurmaz', () => {
    const w = arena('sword');
    // Öndeki daha yakın: kılıç ona döner; arkadaki menzilde ama yayın dışında.
    const front = place(w, 0, 2.2);
    const back = place(w, 0, -2.8);
    run(w, 0.5);
    expect(hpOf(w, front)).toBeLessThan(1000);
    expect(hpOf(w, back)).toBe(1000);
  });

  it('Yörünge taşları yörüngedeki düşmana vurur', () => {
    const w = arena('orbit');
    const r = WEAPONS[WEAPON_INDEX.orbit].base.area;
    const target = place(w, r, 0);
    run(w, 2);
    expect(hpOf(w, target)).toBeLessThan(1000);
  });

  it('Bumerang Balta geri döner ve oyuncuya ulaşınca kaybolur', () => {
    const w = arena('boomerang');
    place(w, 0, 8);
    run(w, 0.35);
    const pr = w.projectiles;
    expect(pr.count).toBeGreaterThan(0);
    expect(pr.kind[0]).toBe(PROJ_AXE);
    let sawReturning = false;
    for (let t = 0; t < 1.6; t += DT) {
      w.step(NO_INPUT, DT);
      if (pr.count > 0 && pr.flags[0] & PF_RETURNING) sawReturning = true;
    }
    expect(sawReturning).toBe(true);
  });

  it('Zincir Şimşek tam olarak isabet sayısı kadar düşmana seker', () => {
    const w = arena('chain');
    const ids = [3, 6, 9, 12, 15].map((d) => place(w, d, 0));
    run(w, 0.35);
    const hit = ids.filter((id) => hpOf(w, id) < 1000).length;
    expect(hit).toBe(WEAPONS[WEAPON_INDEX.chain].base.count);
    expect(w.beamFx.written).toBe(hit);
  });

  it('Havan gecikmeyle patlar', () => {
    const w = arena('mortar');
    const a = place(w, 6, 0);
    place(w, 6.5, 0.5);
    run(w, 0.35);
    expect(w.blasts.count).toBe(1);
    expect(hpOf(w, a)).toBe(1000);
    run(w, 1);
    expect(hpOf(w, a)).toBeLessThan(1000);
    expect(w.blastFx.written).toBe(1);
  });

  it('Saçma Tüfeği yelpaze halinde birden çok saçma atar', () => {
    const w = arena('shotgun');
    place(w, 0, 6);
    run(w, 0.32);
    let pellets = 0;
    for (let i = 0; i < w.projectiles.count; i++) if (w.projectiles.kind[i] === PROJ_PELLET) pellets++;
    expect(pellets).toBe(WEAPONS[WEAPON_INDEX.shotgun].base.count);
  });

  it('hedef yokken atış yapılmaz (bekleme harcanmaz)', () => {
    const w = arena('magicBolt');
    run(w, 1);
    expect(w.projectiles.count).toBe(0);
    expect(w.weapons[0].timer).toBeLessThanOrEqual(0);
  });
});
