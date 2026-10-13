import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import type { PlayerInput } from '../../src/sim/player/Player';
import { World } from '../../src/sim/world/World';

/** Basit bot: önce silah kartları, sonra ilk kart. */
function botChoice(world: World): number {
  const i = world.offer!.findIndex((o) => o.kind === 'weaponLevel' || o.kind === 'weaponNew');
  return i >= 0 ? i : 0;
}

/**
 * Tarayıcı olmadan tam bir run simüle eder: bot daireler çizerek koşar, ara sıra zıplar/kayar,
 * seviye atlayınca hep ilk kartı seçer. Amaç: NaN, exception, sınır taşması ve performans regresyonu yakalamak.
 */
function runBot(world: World, seconds: number): { maxEnemies: number; worstStepMs: number } {
  const dt = BALANCE.simStep;
  const steps = Math.round(seconds / dt);
  const input: PlayerInput = { moveX: 0, moveZ: 0, jump: false, slide: false };
  let maxEnemies = 0;
  let worstStepMs = 0;
  for (let s = 0; s < steps && !world.gameOver; s++) {
    const t = s * dt;
    input.moveX = Math.cos(t * 0.35);
    input.moveZ = Math.sin(t * 0.35);
    input.jump = s % 150 === 0;
    input.slide = s % 400 < 40;
    while (world.offer || world.reward) {
      if (world.reward) world.takeReward();
      else world.choose(botChoice(world));
    }
    const t0 = performance.now();
    world.step(input, dt);
    const ms = performance.now() - t0;
    if (s > 60) worstStepMs = Math.max(worstStepMs, ms);
    maxEnemies = Math.max(maxEnemies, world.enemies.count);
  }
  return { maxEnemies, worstStepMs };
}

function assertFinite(world: World): void {
  const p = world.player;
  for (const v of [p.x, p.y, p.z, p.vx, p.vy, p.vz, p.hp]) expect(Number.isFinite(v)).toBe(true);
  const e = world.enemies;
  for (let i = 0; i < e.count; i++) {
    expect(Number.isFinite(e.x[i]) && Number.isFinite(e.y[i]) && Number.isFinite(e.z[i])).toBe(true);
  }
  expect(Math.abs(p.x)).toBeLessThanOrEqual(world.terrain.playableHalf + 1e-3);
  expect(Math.abs(p.z)).toBeLessThanOrEqual(world.terrain.playableHalf + 1e-3);
}

describe('headless run', () => {
  it('ölümsüz bot 10 dakikayı hatasız tamamlar', () => {
    const world = new World({ seed: 1234, godMode: true, enemyCap: 600 });
    const { maxEnemies } = runBot(world, 600);
    assertFinite(world);
    expect(world.time).toBeGreaterThan(599);
    expect(maxEnemies).toBeLessThanOrEqual(600);
    expect(world.kills).toBeGreaterThan(1000);
    expect(world.level).toBeGreaterThan(10);
  });

  it('normal bot zamanla ölür ve oyun durur', () => {
    const world = new World({ seed: 99 });
    runBot(world, 900);
    expect(world.gameOver).toBe(true);
    const t = world.time;
    world.step({ moveX: 1, moveZ: 0, jump: false, slide: false }, BALANCE.simStep);
    expect(world.time).toBe(t);
  });

  it('aynı seed aynı sonucu verir (determinizm)', () => {
    const a = new World({ seed: 77, godMode: true });
    const b = new World({ seed: 77, godMode: true });
    runBot(a, 60);
    runBot(b, 60);
    expect(a.kills).toBe(b.kills);
    expect(a.player.x).toBe(b.player.x);
    expect(a.enemies.count).toBe(b.enemies.count);
  });
});

describe('performans', () => {
  it('1000 düşmanla bir sim adımı bütçe içinde', () => {
    const world = new World({ seed: 5, godMode: true, enemyCap: 1000 });
    world.spawnBurst(1000, 4, 40);
    const input: PlayerInput = { moveX: 1, moveZ: 0, jump: false, slide: false };
    for (let s = 0; s < 60; s++) world.step(input, BALANCE.simStep); // ısınma
    const steps = 600;
    const t0 = performance.now();
    for (let s = 0; s < steps; s++) {
      while (world.offer || world.reward) {
        if (world.reward) world.takeReward();
        else world.choose(0);
      }
      input.moveX = Math.cos(s * 0.01);
      input.moveZ = Math.sin(s * 0.01);
      world.step(input, BALANCE.simStep);
    }
    const avg = (performance.now() - t0) / steps;
    console.log(`ortalama sim adımı (1000 düşman): ${avg.toFixed(3)} ms`);
    // 60 FPS kare bütçesi 16.6 ms; sim'in bunun küçük bir kısmını kullanması gerekir.
    // CI makineleri yavaş olabileceği için eşik cömert.
    expect(avg).toBeLessThan(6);
  });
});
