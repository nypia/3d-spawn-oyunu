import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { BOSSES } from '../../src/data/bosses';
import { ENEMY_INDEX } from '../../src/data/enemies';
import { CYCLE } from '../../src/data/waves';
import { EF_BOSS } from '../../src/sim/enemies/EnemyPool';
import { NO_INPUT } from '../../src/sim/player/Player';
import { ANN_BLOOD_MOON, ANN_BOSS_SPAWN } from '../../src/sim/world/announce';
import { ALTAR, CHEST } from '../../src/sim/world/Interactables';
import { World } from '../../src/sim/world/World';

const DT = BALANCE.simStep;

/** 20:00'de final boss'u doğurup öldürür. */
function killFinal(): World {
  const w = new World({ seed: 21, enemyCap: 0 });
  w.weapons.length = 0;
  w.landmarks.goblinAt = 1e9;
  w.time = 1200;
  w.bosses.next = BOSSES.length - 1;
  w.step(NO_INPUT, DT);
  let b = -1;
  for (let i = 0; i < w.enemies.count; i++) if (w.enemies.flags[i] & EF_BOSS) b = i;
  // Etrafta sıradan düşmanlar olsun (silinecekler) ve bir sunak kullanılmış olsun.
  for (let k = 0; k < 10; k++) w.spawnEnemy(ENEMY_INDEX.zombie, w.player.x + 10 + k, w.player.z);
  const far = w.spawnEnemy(ENEMY_INDEX.zombie, w.player.x + 80, w.player.z + 80);
  w.enemies.ax[far] = 42; // işaret
  for (let i = 0; i < w.interactables.count; i++)
    if (w.interactables.kind[i] === ALTAR) w.interactables.used[i] = 1;
  w.player.hp = 20;
  w.damageEnemy(b, 1e12, 0, 0);
  return w;
}

describe('Kan Ayı', () => {
  it('final boss ölünce yeni döngü başlar, oyun bitmez ve süre ilerler', () => {
    const w = killFinal();
    expect(w.cycle).toBe(2);
    expect(w.cycleStart).toBeCloseTo(w.time);
    let ann = 0;
    w.announceFx.drain(0, (d, o) => {
      if (d[o] === ANN_BLOOD_MOON) ann = d[o + 1];
    });
    expect(ann).toBe(2);
    const t = w.time;
    for (let s = 0; s < 120; s++) w.step(NO_INPUT, DT);
    expect(w.gameOver).toBe(false);
    expect(w.time).toBeGreaterThan(t + 1.9);
  });

  it('yakındaki sıradan düşmanlar silinir, can yarı dolar, sunaklar yeniden açılır', () => {
    const w = killFinal();
    w.enemies.removeDead();
    let near = 0;
    let farAlive = false;
    for (let i = 0; i < w.enemies.count; i++) {
      if (w.enemies.ax[i] === 42) farAlive = true;
      else if (w.enemies.type[i] === ENEMY_INDEX.zombie) near++;
    }
    expect(near).toBe(0);
    expect(farAlive).toBe(true);
    expect(w.player.hp).toBeGreaterThanOrEqual(20 + w.player.maxHp * 0.5 - 1e-6);
    for (let i = 0; i < w.interactables.count; i++) {
      if (w.interactables.kind[i] === ALTAR) expect(w.interactables.used[i]).toBe(0);
    }
  });

  it("boss'lar döngü başına göre gelir (final ~8 dk sonra); yeni düşmanlar daha güçlü", () => {
    const w = killFinal();
    expect(w.bosses.next).toBe(0);
    const start = w.cycleStart + CYCLE.calm;
    expect(w.bosses.dueAt(w)).toBeGreaterThanOrEqual(start + BOSSES[0].bloodAt);
    w.bosses.next = BOSSES.length - 1;
    expect(w.bosses.dueAt(w)).toBeCloseTo(start + BOSSES[BOSSES.length - 1].bloodAt);
    const strong = w.enemies.maxHp[w.spawnEnemy(ENEMY_INDEX.skeleton, 50, 50)];
    w.cycle = 1;
    const normal = w.enemies.maxHp[w.spawnEnemy(ENEMY_INDEX.skeleton, 52, 50)];
    expect(strong).toBeGreaterThanOrEqual(normal * 1.5 - 1e-6);
  });

  it('çizelge 8:00 karışımından hızlı tekrar oynar, kısa sakinlikten sonra düşman gelir', () => {
    const w = killFinal();
    w.enemyCap = 600;
    expect(w.director.timelineTime(w)).toBeCloseTo(480, 0);
    w.enemies.removeDead();
    const before = w.enemies.count;
    for (let t = 0; t < 4; t += DT) w.step(NO_INPUT, DT);
    expect(w.enemies.count).toBe(before);
    for (let t = 0; t < 8; t += DT) w.step(NO_INPUT, DT);
    expect(w.enemies.count).toBeGreaterThan(before);
    // Sakinlik bitince çizelge ilerlemeye başlar (1,5 kat hızla).
    expect(w.director.timelineTime(w)).toBeGreaterThan(CYCLE.timelineStart + 2);
  });

  it('final geç öldürülse de (31:40) Kanlı Balçık Kral atlanmaz', () => {
    const w = new World({ seed: 22, enemyCap: 0, godMode: true });
    w.weapons.length = 0;
    w.landmarks.goblinAt = 1e9;
    w.time = 1900;
    w.bosses.next = BOSSES.length - 1;
    w.step(NO_INPUT, DT);
    let b = -1;
    for (let i = 0; i < w.enemies.count; i++) if (w.enemies.flags[i] & EF_BOSS) b = i;
    w.damageEnemy(b, 1e12, 0, 0);
    expect(w.cycle).toBe(2);
    w.enemies.removeDead();
    // Döngü başına göre (ve iki boss arası en az minGap) doğar; geç kalınca atlanmaz.
    const due = w.bosses.dueAt(w);
    expect(due).toBeGreaterThanOrEqual(w.cycleStart + CYCLE.calm + BOSSES[0].bloodAt);
    while (w.time < due + 0.5) w.step(NO_INPUT, DT);
    const spawned: number[] = [];
    w.announceFx.drain(0, (d, o) => {
      if (d[o] === ANN_BOSS_SPAWN) spawned.push(d[o + 1]);
    });
    expect(spawned).toContain(0);
  });

  it('Kan Ayı açılmış ücretli sandıkları yeniden açar (bedava sandıklar değil)', () => {
    const w = new World({ seed: 23, enemyCap: 0 });
    const it = w.interactables;
    const paid: number[] = [];
    for (let i = 0; i < it.count; i++) {
      if (it.kind[i] === CHEST && !it.free[i]) {
        it.used[i] = 1;
        paid.push(i);
      }
    }
    expect(paid.length).toBeGreaterThan(0);
    w.startBloodMoon();
    for (const i of paid) expect(it.used[i]).toBe(0);
  });
});
