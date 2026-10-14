import { describe, expect, it } from 'vitest';
import { gemTier } from '../../src/data/gems';
import { GemPool } from '../../src/sim/pickups/GemPool';
import { NO_INPUT } from '../../src/sim/player/Player';
import { COLLECT_GEM, World } from '../../src/sim/world/World';

describe('XP taşları', () => {
  it('kademeler: mavi ≤2, yeşil ≤9, kırmızı ≤49, mor 50+', () => {
    expect(gemTier(1)).toBe(0);
    expect(gemTier(2)).toBe(0);
    expect(gemTier(3)).toBe(1);
    expect(gemTier(9)).toBe(1);
    expect(gemTier(10)).toBe(2);
    expect(gemTier(49)).toBe(2);
    expect(gemTier(50)).toBe(3);
  });

  it('yakına düşen taşlar birleşir', () => {
    const g = new GemPool(100);
    for (let k = 0; k < 10; k++) g.add(5 + k * 0.05, 0, 5, 1, 0, 0);
    expect(g.count).toBe(1);
    expect(g.value[0]).toBe(10);
  });

  it('havuz doluyken XP kaybolmaz ve yeni taş öldürme yerinde çıkar', () => {
    const g = new GemPool(50);
    for (let k = 0; k < 50; k++) g.add(k * 3, 0, 0, 1, 0, 0);
    expect(g.count).toBe(50);
    const before = g.totalValue();
    g.add(-10, 0, -10, 2, 0, 0);
    expect(g.count).toBe(50);
    expect(g.totalValue()).toBe(before + 2);
    // En uzak taş (x = 147) yeni taşa katıldı, yeni taş (-10,-10)'da.
    const i = Array.from(g.x.subarray(0, g.count)).findIndex((x, j) => x === -10 && g.z[j] === -10);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(g.value[i]).toBe(3);
  });

  it('dünyada: havuz doluyken öldürülen düşmanın yanında taş görünür', () => {
    const w = new World({ seed: 3, enemyCap: 0 });
    const p = w.player;
    const cap = w.gems.capacity;
    for (let k = 0; k < cap; k++)
      w.gems.add(p.x + 50 + (k % 40) * 2, p.y, p.z + 50 + Math.floor(k / 40) * 2, 1, p.x, p.z);
    expect(w.gems.count).toBe(cap);
    const i = w.spawnEnemy(0, p.x + 6, p.z);
    const ex = w.enemies.x[i];
    const ez = w.enemies.z[i];
    w.damageEnemy(i, 1e6, 0, 0);
    let near = false;
    for (let j = 0; j < w.gems.count; j++)
      if (Math.hypot(w.gems.x[j] - ex, w.gems.z[j] - ez) < 0.5) near = true;
    expect(near).toBe(true);
  });

  it('güçlü düşmanlar daha çok XP verir ve XP zamanla artar', () => {
    const w = new World({ seed: 3, enemyCap: 0 });
    const slime = w.spawnEnemy(0, 10, 10);
    const golem = w.spawnEnemy(5, 12, 10);
    const elite = w.spawnEnemy(5, 14, 10, true);
    expect(w.enemies.xp[golem]).toBeGreaterThan(w.enemies.xp[slime] * 4);
    expect(gemTier(w.enemies.xp[elite])).toBe(3);
    w.time = 600;
    const late = w.spawnEnemy(0, 16, 10);
    expect(w.enemies.xp[late]).toBeGreaterThan(w.enemies.xp[slime] * 1.5);
  });

  it('toplanan taş render için ışıltı olayı yazar', () => {
    const w = new World({ seed: 3, enemyCap: 0 });
    const p = w.player;
    w.gems.add(p.x + 0.3, p.y + 0.8, p.z, 7, p.x, p.z);
    const before = w.collectFx.written;
    for (let k = 0; k < 10; k++) w.step(NO_INPUT, 1 / 60);
    expect(w.collectFx.written).toBe(before + 1);
    let kind = -1;
    let value = 0;
    w.collectFx.drain(before, (d, o) => {
      kind = d[o + 3];
      value = d[o + 4];
    });
    expect(kind).toBe(COLLECT_GEM);
    expect(value).toBe(7);
  });
});
