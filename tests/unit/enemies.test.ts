import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { ELITE, ENEMIES, ENEMY_INDEX, SHOT_ORB, VAMPIRE_DASH } from '../../src/data/enemies';
import { ST_ACT } from '../../src/sim/enemies/EnemyPool';
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

describe('temas', () => {
  it('yarasa yerdeki oyuncuya vurur', () => {
    const w = arena();
    const p = w.player;
    w.spawnEnemy(ENEMY_INDEX.bat, p.x + 3, p.z);
    run(w, 3);
    expect(p.hp).toBeLessThan(p.maxHp);
  });

  it('zıplayan oyuncu balçığın üstünden geçer (dikey örtüşme yok)', () => {
    const w = arena();
    const p = w.player;
    w.spawnEnemy(ENEMY_INDEX.slime, p.x + 0.3, p.z);
    for (let t = 0; t < 1; t += DT) {
      p.y = w.terrain.heightAt(p.x, p.z) + 2;
      p.vy = 0;
      w.step(NO_INPUT, DT);
    }
    expect(p.hp).toBe(p.maxHp);
  });
});

describe('yeni yaratıklar', () => {
  it('Vampir hazırlanır, oyuncuya atılır ve vurur', () => {
    const w = arena();
    const p = w.player;
    w.spawnEnemy(ENEMY_INDEX.vampire, p.x + 8, p.z);
    let dashed = false;
    let maxSpeed = 0;
    for (let t = 0; t < 2; t += DT) {
      const x0 = w.enemies.x[0];
      const z0 = w.enemies.z[0];
      w.step(NO_INPUT, DT);
      if (w.enemies.count === 0) break;
      if (w.enemies.state[0] === ST_ACT) dashed = true;
      maxSpeed = Math.max(maxSpeed, Math.hypot(w.enemies.x[0] - x0, w.enemies.z[0] - z0) / DT);
    }
    expect(dashed).toBe(true);
    expect(maxSpeed).toBeGreaterThan(VAMPIRE_DASH.speed * 0.8);
    expect(p.hp).toBeLessThan(p.maxHp);
  });

  it('Bekçi küresi oyuncuyu izler', () => {
    const w = arena();
    const p = w.player;
    w.spawnEnemy(ENEMY_INDEX.keeper, p.x, p.z + 18);
    w.enemies.timer[0] = 0;
    w.step(NO_INPUT, DT);
    const s = w.enemyShots;
    expect(s.count).toBe(1);
    expect(s.kind[0]).toBe(SHOT_ORB);
    // Oyuncu yana kaçar: küre dönüp onu kovalar.
    const angleTo = () => {
      const want = Math.atan2(p.x - s.x[0], p.z - s.z[0]);
      const cur = Math.atan2(s.vx[0], s.vz[0]);
      return Math.abs(Math.atan2(Math.sin(want - cur), Math.cos(want - cur)));
    };
    p.x += 5;
    const before = angleTo();
    for (let t = 0; t < 0.6; t += DT) w.step(NO_INPUT, DT);
    expect(before).toBeGreaterThan(0.2);
    expect(angleTo()).toBeLessThan(before * 0.5);
  });

  it('Hayalet engellerin içinden geçer, zombi geçemez', () => {
    const w = arena();
    const o = w.obstacles;
    // Oyuncuya yakın, büyükçe bir engel seç.
    let k = 0;
    for (let i = 1; i < o.count; i++)
      if (o.radius[i] > 1 && Math.hypot(o.x[i], o.z[i]) < Math.hypot(o.x[k], o.z[k])) k = i;
    const r = o.radius[k];
    const crossInside = (type: number) => {
      const t = arena();
      const p = t.player;
      t.spawnEnemy(type, o.x[k] - r - 2, o.z[k]);
      let inside = false;
      for (let s = 0; s < 240 && t.enemies.count > 0; s++) {
        p.x = o.x[k] + r + 3;
        p.z = o.z[k];
        p.y = t.terrain.heightAt(p.x, p.z) + 3; // temas olmasın
        p.vy = 0;
        t.step(NO_INPUT, DT);
        if (Math.hypot(t.enemies.x[0] - o.x[k], t.enemies.z[0] - o.z[k]) < r * 0.5) inside = true;
      }
      return inside;
    };
    expect(crossInside(ENEMY_INDEX.ghost)).toBe(true);
    expect(crossInside(ENEMY_INDEX.zombie)).toBe(false);
  });
});
