import type { Rng } from '../../core/Rng';
import { BALANCE } from '../../data/balance';
import { ENEMIES, ENEMY_INDEX } from '../../data/enemies';
import type { World } from '../world/World';

const S = BALANCE.spawn;

/**
 * Kredi tabanlı spawn direktörü:
 *  - Her saniye zamana bağlı bir kredi birikir; kredi o an açık düşman türlerine harcanır.
 *  - Düşmanlar oyuncunun etrafındaki halkada, hareket yönüne ağırlıklı doğar.
 *  - Aktif düşman sınırına ulaşılınca yeni düşman doğmaz.
 *  - Çok uzakta kalan düşmanlar oyuncunun önüne taşınır (geri dönüşüm).
 *  - Belirli aralıklarla "kuşatma halkası" olayı.
 */
export class SpawnDirector {
  credit = 0;
  private nextRingEvent: number = S.ringEventInterval;
  private readonly weights: number[] = ENEMIES.map(() => 0);

  constructor(private readonly rng: Rng) {}

  creditRate(time: number): number {
    const m = time / 60;
    return S.creditA + S.creditB * m + S.creditC * m * m;
  }

  hpMultiplier(time: number): number {
    return 1 + S.hpPerMinute * (time / 60);
  }

  damageMultiplier(time: number): number {
    return 1 + S.damagePerMinute * (time / 60);
  }

  update(world: World, dt: number): void {
    const t = world.time;
    this.credit = Math.min(S.maxStoredCredit, this.credit + this.creditRate(t) * dt);

    // Krediyi harca
    let guard = 64;
    while (guard-- > 0 && world.enemies.count < world.enemyCap) {
      for (let k = 0; k < ENEMIES.length; k++) {
        const d = ENEMIES[k];
        this.weights[k] = t >= d.unlockTime && d.cost <= this.credit ? d.weight : 0;
      }
      const type = this.rng.weightedIndex(this.weights);
      if (type < 0) break;
      if (!this.spawnAroundPlayer(world, type)) break;
      this.credit -= ENEMIES[type].cost;
    }

    // Kuşatma halkası
    if (t >= this.nextRingEvent) {
      this.nextRingEvent += S.ringEventInterval;
      const n = Math.round(16 + 6 * (t / 60));
      this.spawnRing(world, ENEMY_INDEX.slime, n, 17);
    }

    this.recycleFarEnemies(world);
  }

  spawnAroundPlayer(world: World, type: number): boolean {
    const p = world.player;
    const moving = p.speed > 1;
    const base = moving ? Math.atan2(p.vx, p.vz) : 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      const a = moving ? base + this.rng.gaussian() * 1.1 : this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(S.ringMin, S.ringMax);
      const x = world.terrain.clampToPlayable(p.x + Math.sin(a) * r);
      const z = world.terrain.clampToPlayable(p.z + Math.cos(a) * r);
      // Sınıra çarpıp oyuncunun dibine düştüyse başka açı dene.
      if ((x - p.x) ** 2 + (z - p.z) ** 2 < (S.ringMin * 0.6) ** 2) continue;
      return world.spawnEnemy(type, x, z) >= 0;
    }
    return false;
  }

  spawnRing(world: World, type: number, n: number, radius: number): void {
    const p = world.player;
    for (let k = 0; k < n && world.enemies.count < world.enemyCap; k++) {
      const a = (k / n) * Math.PI * 2;
      const x = world.terrain.clampToPlayable(p.x + Math.sin(a) * radius);
      const z = world.terrain.clampToPlayable(p.z + Math.cos(a) * radius);
      world.spawnEnemy(type, x, z);
    }
  }

  private recycleFarEnemies(world: World): void {
    const e = world.enemies;
    const p = world.player;
    const d2max = S.despawnDistance * S.despawnDistance;
    const moving = p.speed > 1;
    const base = moving ? Math.atan2(p.vx, p.vz) : 0;
    for (let i = 0; i < e.count; i++) {
      if (e.dead[i]) continue;
      const dx = e.x[i] - p.x;
      const dz = e.z[i] - p.z;
      if (dx * dx + dz * dz <= d2max) continue;
      const a = moving ? base + this.rng.gaussian() * 0.9 : this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(S.ringMin, S.ringMax);
      e.x[i] = world.terrain.clampToPlayable(p.x + Math.sin(a) * r);
      e.z[i] = world.terrain.clampToPlayable(p.z + Math.cos(a) * r);
      e.y[i] = world.terrain.heightAt(e.x[i], e.z[i]);
    }
  }
}
