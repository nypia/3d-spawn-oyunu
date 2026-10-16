import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { ENEMIES, ENEMY_INDEX } from '../../src/data/enemies';
import { CYCLE, WAVE_EVENTS, waveWeights } from '../../src/data/waves';
import { NO_INPUT } from '../../src/sim/player/Player';
import { ANN_EVENT } from '../../src/sim/world/announce';
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

  it("çizelge 20:00'ı geçince olaylar 8:00'dan yeniden ve daha kalabalık gelir", () => {
    const w = new World({ seed: 4, godMode: true });
    w.weapons.length = 0;
    w.landmarks.goblinAt = 1e9;
    w.bosses.next = 99;
    const first = WAVE_EVENTS.findIndex((e) => e.at >= CYCLE.loopFrom);
    const ev = WAVE_EVENTS[first];
    w.time = CYCLE.length + 0.5;
    w.step(NO_INPUT, DT);
    const seen: [number, number][] = [];
    w.announceFx.drain(0, (d, o) => {
      if (d[o] === ANN_EVENT) seen.push([d[o + 1], d[o + 2]]);
    });
    expect(w.director.eventLoop).toBe(1);
    expect(seen.map((x) => x[0])).toContain(first);
    const n = seen.find((x) => x[0] === first)?.[1] ?? 0;
    expect(n).toBeGreaterThan(ev.count);
  });

  it('Kan Ayı döngüsünde olaylar ~500 sn sonra da sürer', () => {
    const w = new World({ seed: 6, godMode: true, enemyCap: 0 });
    w.weapons.length = 0;
    w.cycle = 2;
    w.cycleStart = 1300;
    w.time = 1300 + CYCLE.calm + 500;
    w.director.startCycle(w);
    w.director.calmUntil = 0;
    w.enemyCap = 50;
    const before = w.announceFx.written;
    for (let t = 0; t < 30; t += DT) {
      w.time += DT;
      w.director.update(w, DT);
      w.enemies.count = 0;
    }
    let events = 0;
    w.announceFx.drain(before, (d, o) => {
      if (d[o] === ANN_EVENT) events++;
    });
    expect(events).toBeGreaterThan(0);
  });
});
