import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { ELITE, ENEMIES, ENEMY_INDEX } from '../../src/data/enemies';
import { NO_INPUT } from '../../src/sim/player/Player';
import { World } from '../../src/sim/world/World';

const DT = BALANCE.simStep;

/** Silahsız, spawn'sız test dünyası. */
function arena(): World {
  const w = new World({ seed: 21, enemyCap: 0 });
  w.weapons.length = 0;
  return w;
}

function run(w: World, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) w.step(NO_INPUT, DT);
}

describe('düşman davranışları', () => {
  it('Okçu mesafe korur ve oyuncuya ok atar', () => {
    const w = arena();
    const p = w.player;
    w.spawnEnemy(ENEMY_INDEX.archer, p.x, p.z + 12);
    let maxShots = 0;
    for (let t = 0; t < 4; t += DT) {
      w.step(NO_INPUT, DT);
      maxShots = Math.max(maxShots, w.enemyShots.count);
    }
    expect(maxShots).toBeGreaterThan(0);
    expect(p.hp).toBeLessThan(p.maxHp);
    const d = Math.hypot(w.enemies.x[0] - p.x, w.enemies.z[0] - p.z);
    expect(d).toBeGreaterThan(8);
  });

  it('zıplayan oyuncu oku atlatabilir (ok göğüs hizasında gelir)', () => {
    const w = arena();
    const p = w.player;
    w.spawnEnemy(ENEMY_INDEX.archer, p.x, p.z + 12);
    w.enemies.timer[0] = 0; // hemen ateş etsin
    w.step(NO_INPUT, DT);
    expect(w.enemyShots.count).toBe(1);
    // Ok uçarken oyuncuyu yükseğe al.
    p.y += 4;
    p.vy = 0;
    const hp = p.hp;
    for (let t = 0; t < 1.2; t += DT) {
      p.y = w.terrain.heightAt(p.x, p.z) + 4;
      p.vy = 0;
      w.step(NO_INPUT, DT);
    }
    expect(p.hp).toBe(hp);
  });

  it('Patlayan fitili ateşler, patlar ve oyuncuya hasar verir (kill sayılmaz)', () => {
    const w = arena();
    const p = w.player;
    w.spawnEnemy(ENEMY_INDEX.exploder, p.x + 1.5, p.z);
    run(w, 1.2);
    expect(w.enemies.count).toBe(0);
    expect(w.kills).toBe(0);
    expect(p.hp).toBeLessThan(p.maxHp - ENEMIES[ENEMY_INDEX.exploder].damage * 0.9);
    expect(w.blastFx.written).toBe(1);
  });

  it('elit daha güçlü ve XP ödülü büyük', () => {
    const w = arena();
    const i = w.spawnEnemy(ENEMY_INDEX.slime, w.player.x + 20, w.player.z, true);
    const normal = w.spawnEnemy(ENEMY_INDEX.slime, w.player.x - 20, w.player.z);
    expect(w.enemies.maxHp[i]).toBeCloseTo(w.enemies.maxHp[normal] * ELITE.hp);
    expect(w.enemies.scale[i]).toBeCloseTo(ELITE.scale);
    w.damageEnemy(i, 1e6, 0, 0);
    expect(w.eliteKills).toBe(1);
    expect(w.gems.value[0]).toBe(ENEMIES[ENEMY_INDEX.slime].xp * ELITE.xp);
  });

  it('spawn direktörü 75. saniyede elit doğurur', () => {
    const w = new World({ seed: 4, godMode: true });
    w.weapons.length = 0;
    run(w, ELITE.interval + 0.5);
    let elites = 0;
    for (let i = 0; i < w.enemies.count; i++) elites += w.enemies.elite[i];
    expect(elites).toBe(1);
  });
});
