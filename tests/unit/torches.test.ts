import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { ENEMY_INDEX } from '../../src/data/enemies';
import { TORCH, TORCH_DROPS, torchDropWeights } from '../../src/data/torches';
import { PROJ_BOLT } from '../../src/sim/combat/ProjectilePool';
import {
  PICKUP_BAG,
  PICKUP_CLOCK,
  PICKUP_GOLD,
  PICKUP_MAGNET,
  PICKUP_ROSARY,
} from '../../src/sim/pickups/PickupPool';
import { NO_INPUT } from '../../src/sim/player/Player';
import { World } from '../../src/sim/world/World';

const DT = BALANCE.simStep;

function arena(): World {
  const w = new World({ seed: 31, enemyCap: 0 });
  w.weapons.length = 0;
  return w;
}

function run(w: World, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) w.step(NO_INPUT, DT);
}

/** Oyuncunun yanına (dx,dz) meşale koyar. */
function torchAt(w: World, dx: number, dz: number): number {
  return w.torches.add(w.player.x + dx, w.player.z + dz, 0);
}

function pickupsOf(w: World, kind: number): number {
  let n = 0;
  for (let i = 0; i < w.pickups.count; i++) if (w.pickups.kind[i] === kind) n++;
  return n;
}

describe('meşaleler', () => {
  it('oyuncunun 15–30 m çevresinde belirir, yakında en fazla 6 olur', () => {
    const w = arena();
    run(w, TORCH.firstDelay + 0.1);
    expect(w.torches.count).toBe(1);
    const p = w.player;
    const d = Math.hypot(w.torches.x[0] - p.x, w.torches.z[0] - p.z);
    expect(d).toBeGreaterThanOrEqual(TORCH.minDist - 0.01);
    expect(d).toBeLessThanOrEqual(TORCH.maxDist + 0.01);
    run(w, TORCH.interval * 10);
    expect(w.torches.count).toBe(TORCH.maxNear);
  });

  it('uzaklaşınca kaldırılır', () => {
    const w = arena();
    torchAt(w, 10, 0);
    w.player.x -= TORCH.despawn;
    w.step(NO_INPUT, DT);
    expect(w.torches.count).toBe(0);
  });

  it('üstüne yürüyünce kırılır ve ödül düşer', () => {
    const w = arena();
    torchAt(w, 0.5, 0);
    w.step(NO_INPUT, DT);
    expect(w.torches.count).toBe(0);
    expect(w.pickups.count).toBe(1);
  });

  it('mermi ve alan hasarı meşaleyi kırar', () => {
    const w = arena();
    const p = w.player;
    torchAt(w, 6, 0);
    w.spawnProjectile({
      kind: PROJ_BOLT,
      ...{ x: p.x, y: p.y + 1.1, z: p.z, vx: 20, vy: 0, vz: 0 },
      ...{ life: 1, damage: 5, radius: 0.3, pierce: 1, knockback: 0 },
    });
    run(w, 0.5);
    expect(w.torches.count).toBe(0);

    torchAt(w, 0, 3);
    w.damageInRadius(p.x, p.y, p.z + 3, 1, 5, 0);
    expect(w.torches.count).toBe(0);
  });

  it('nadir ödüller seviye kapılı; Şans onları artırır', () => {
    const at1 = torchDropWeights(1, 0);
    TORCH_DROPS.forEach((d, i) => {
      expect(at1[i] > 0).toBe(d.minLevel <= 1);
    });
    const lucky = torchDropWeights(10, 1);
    const plain = torchDropWeights(10, 0);
    TORCH_DROPS.forEach((d, i) => {
      if (d.rare) expect(lucky[i]).toBeGreaterThan(plain[i]);
      else expect(lucky[i]).toBe(plain[i]);
    });

    const w = arena();
    w.level = 10;
    for (let k = 0; k < 300; k++) w.breakTorch(torchAt(w, 50, 0));
    for (const kind of [PICKUP_BAG, PICKUP_MAGNET, PICKUP_CLOCK, PICKUP_ROSARY]) {
      expect(pickupsOf(w, kind)).toBeGreaterThan(0);
    }
  });

  it('altın kesesi altın verir ve mıknatısla çekilir', () => {
    const w = arena();
    const p = w.player;
    w.pickups.add(PICKUP_BAG, p.x + 30, p.y + 0.3, p.z, 5);
    w.pickups.add(PICKUP_GOLD, p.x - 30, p.y + 0.3, p.z, 1);
    w.attract();
    run(w, 4);
    expect(w.gold).toBeCloseTo(6);
  });
});

describe('Saat ve Tespih', () => {
  it('Saat 40 m içindeki düşmanları dondurur', () => {
    const w = arena();
    const p = w.player;
    const near = w.spawnEnemy(ENEMY_INDEX.skeleton, p.x + 20, p.z);
    const far = w.spawnEnemy(ENEMY_INDEX.skeleton, p.x + 60, p.z);
    w.pickups.add(PICKUP_CLOCK, p.x, p.y + 0.5, p.z, 1);
    w.step(NO_INPUT, DT);
    expect(w.enemies.frozen[near]).toBeGreaterThan(TORCH.clockTime - 0.1);
    expect(w.enemies.frozen[far]).toBe(0);
  });

  it('Tespih yakındaki elit olmayanları öldürür, elitlere büyük hasar verir', () => {
    const w = arena();
    const p = w.player;
    for (let k = 0; k < 10; k++) w.spawnEnemy(ENEMY_INDEX.slime, p.x + 5 + k, p.z + 3);
    const elite = w.spawnEnemy(ENEMY_INDEX.golem, p.x - 10, p.z, true);
    const eliteHp = w.enemies.hp[elite];
    w.spawnEnemy(ENEMY_INDEX.slime, p.x + 50, p.z);
    w.pickups.add(PICKUP_ROSARY, p.x, p.y + 0.5, p.z, 1);
    w.step(NO_INPUT, DT);
    expect(w.kills).toBe(10);
    expect(w.enemies.count).toBe(2);
    expect(w.holyAt).toBeGreaterThanOrEqual(0);
    let hp = 0;
    for (let i = 0; i < w.enemies.count; i++) if (w.enemies.elite[i]) hp = w.enemies.hp[i];
    expect(hp).toBeLessThan(eliteHp * (1 - TORCH.rosaryEliteFrac) + 1);
    expect(w.gems.count).toBeGreaterThan(0);
  });
});
