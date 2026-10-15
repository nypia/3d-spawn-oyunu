import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { ENEMIES, ENEMY_INDEX } from '../../src/data/enemies';
import { WAVE_EVENTS, waveWeights } from '../../src/data/waves';
import { NO_INPUT } from '../../src/sim/player/Player';
import { World } from '../../src/sim/world/World';

const DT = BALANCE.simStep;

describe('spawn direktörü', () => {
  it('pahalı türler için kredi biriktirir: 9:00 karışımındaki her tür gerçekten doğar', () => {
    const w = new World({ seed: 5, godMode: true });
    w.weapons.length = 0;
    const start = 540;
    w.time = start;
    // Olayları atla: yalnızca sürekli spawn ölçülsün.
    w.director.eventCursor = WAVE_EVENTS.length;
    w.director.nextElite = 1e9;
    for (let t = 0; t < 50; t += DT) {
      w.time += DT;
      w.director.update(w, DT);
      w.enemies.count = 0;
    }
    const weights = ENEMIES.map(() => 0);
    waveWeights(start, weights);
    const spawned = w.director.spawned;
    const total = spawned.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(100);
    weights.forEach((v, i) => {
      if (v > 0) expect(spawned[i], ENEMIES[i].id).toBeGreaterThan(0);
      else expect(spawned[i], ENEMIES[i].id).toBe(0);
    });
    expect(spawned[ENEMY_INDEX.archer] / total).toBeGreaterThan(0.05);
  });

  it('can, hasar ve hız zamanla ve Kan Ayı döngüsüyle artar', () => {
    const d = new World({ seed: 1 }).director;
    expect(d.hpMultiplier(1200)).toBeGreaterThan(d.hpMultiplier(600) * 2);
    expect(d.hpMultiplier(1200)).toBeGreaterThan(10);
    for (const t of [0, 300, 1200]) {
      expect(d.hpMultiplier(t, 2)).toBeGreaterThanOrEqual(d.hpMultiplier(t, 1) * 1.5 - 1e-9);
      expect(d.damageMultiplier(t, 2)).toBeGreaterThan(d.damageMultiplier(t, 1));
      expect(d.speedMultiplier(t, 2)).toBeGreaterThan(d.speedMultiplier(t, 1));
    }
  });

  it('düşman hızı üst sınırı aşmaz', () => {
    const w = new World({ seed: 2, enemyCap: 0 });
    w.time = 3600;
    w.cycle = 6;
    const i = w.spawnEnemy(ENEMY_INDEX.bat, w.player.x + 20, w.player.z);
    expect(w.enemies.speed[i]).toBeLessThanOrEqual(BALANCE.spawn.maxEnemySpeed);
  });

  it('temalı olay zamanında gelir ve duyurulur', () => {
    const w = new World({ seed: 3, godMode: true });
    w.weapons.length = 0;
    const ev = WAVE_EVENTS[0];
    w.time = ev.at - 0.5;
    for (let t = 0; t < 1; t += DT) w.step(NO_INPUT, DT);
    expect(w.announceFx.written).toBe(1);
    let n = 0;
    for (let i = 0; i < w.enemies.count; i++) if (w.enemies.type[i] === ENEMY_INDEX[ev.enemy]) n++;
    expect(n).toBeGreaterThanOrEqual(ev.count);
  });
});
