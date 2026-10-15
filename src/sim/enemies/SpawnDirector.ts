import type { Rng } from '../../core/Rng';
import { BALANCE } from '../../data/balance';
import { BOSS } from '../../data/bosses';
import { ELITE, ENEMIES, ENEMY_INDEX } from '../../data/enemies';
import { CYCLE, WAVE_EVENTS, type WaveEvent, waveWeights } from '../../data/waves';
import { ANN_EVENT } from '../world/announce';
import type { World } from '../world/World';
import { EF_BOSS, EF_SPECIAL } from './EnemyPool';

const S = BALANCE.spawn;

/**
 * Zaman çizelgeli spawn direktörü:
 *  - Çizelge (data/waves) hangi türün ne oranda doğacağını belirler; türler zamanla katılır ve
 *    emekliye ayrılır.
 *  - Kredi zamanla hızlanarak birikir. Önce tür seçilir, kredi o türün maliyetine yetene kadar
 *    biriktirilir (pahalı türler de gerçekten gelsin).
 *  - Temalı olaylar (çember, sürü, akın) belirli dakikalarda gelir ve sınırı biraz aşabilir.
 *  - Elitler giderek sıklaşır. Uzakta kalan sıradan düşmanlar oyuncunun önüne taşınır.
 */
export class SpawnDirector {
  credit = 0;
  /** Kredisi biriktirilen sıradaki tür (−1 = seçilmedi). */
  pending = -1;
  eventCursor = 0;
  nextElite: number = ELITE.interval;
  /** Bu zamana kadar normal spawn yok (Kan Ayı başlangıcı). */
  calmUntil = 0;
  /** Tür başına doğurulan düşman sayısı (tanı ve testler). */
  readonly spawned = new Uint32Array(ENEMIES.length);
  private readonly weights: number[] = ENEMIES.map(() => 0);

  constructor(private readonly rng: Rng) {}

  /**
   * Çizelge zamanı: 1. döngüde gerçek zaman; Kan Ayı'nda sakinlik bitince 8:00'dan hızlı tekrar
   * (en fazla 20:00).
   */
  timelineTime(world: World): number {
    if (world.cycle <= 1) return Math.min(CYCLE.length, world.time);
    const t = Math.max(0, world.time - world.cycleStart - CYCLE.calm);
    return Math.min(CYCLE.length, CYCLE.timelineStart + t * CYCLE.pace);
  }

  creditRate(tl: number): number {
    const m = tl / 60;
    return S.creditA + S.creditB * m + S.creditC * m * m;
  }

  /** Can çarpanı: mutlak zamanla (sonsuz modda da) büyür, Kan Ayı döngüsüyle katlanır. */
  hpMultiplier(time: number, cycle = 1): number {
    const m = time / 60;
    return (1 + S.hpA * m + S.hpB * m * m) * CYCLE.hp ** (cycle - 1);
  }

  damageMultiplier(time: number, cycle = 1): number {
    const m = time / 60;
    return (1 + S.damageA * m + S.damageB * m * m) * CYCLE.damage ** (cycle - 1);
  }

  speedMultiplier(time: number, cycle = 1): number {
    return Math.min(S.speedMax, 1 + S.speedPerMinute * (time / 60)) * CYCLE.speed ** (cycle - 1);
  }

  /** Olayların sınırı biraz aşabildiği tavan. */
  eventCap(world: World): number {
    return Math.min(world.enemies.capacity, Math.ceil(world.enemyCap * S.eventOverflow));
  }

  update(world: World, dt: number): void {
    const t = world.time;
    const c = world.cycle;
    const tl = this.timelineTime(world);
    waveWeights(tl, this.weights);

    const curse = 1 + Math.max(0, world.stats.get('curse'));
    const calm = t < this.calmUntil ? 0 : 1;
    // Boss sahnedeyken normal akış seyrelir.
    const boss = world.bosses.active.length > 0 ? BOSS.creditMulAlive : 1;
    const rate = this.creditRate(tl) * CYCLE.credit ** (c - 1) * curse * calm * boss;
    this.credit = Math.min(S.maxStoredCredit, this.credit + rate * dt);

    // Önce tür seç, sonra kredisini biriktir.
    if (this.pending < 0 || this.weights[this.pending] <= 0)
      this.pending = this.rng.weightedIndex(this.weights);
    let guard = 64;
    while (guard-- > 0 && this.pending >= 0 && world.enemies.count < world.enemyCap) {
      const cost = ENEMIES[this.pending].cost;
      if (this.credit < cost) break;
      if (!this.spawnAroundPlayer(world, this.pending)) break;
      this.credit -= cost;
      this.spawned[this.pending]++;
      this.pending = this.rng.weightedIndex(this.weights);
    }

    // Temalı olaylar (sakinlikte beklerler).
    while (calm && this.eventCursor < WAVE_EVENTS.length && WAVE_EVENTS[this.eventCursor].at <= tl) {
      const index = this.eventCursor++;
      const ev = WAVE_EVENTS[index];
      if (tl - ev.at > S.staleEvent) continue;
      this.fireEvent(world, ev, index);
    }

    // Elitler: çizelgedeki türlerden (patlayan hariç), zamanla sıklaşır.
    if (t >= this.nextElite) {
      const m = t / 60;
      this.nextElite = t + Math.max(ELITE.minInterval, ELITE.interval - 2 * m);
      const exploder = ENEMY_INDEX.exploder;
      const saved = this.weights[exploder];
      this.weights[exploder] = 0;
      for (let k = 0; k < Math.min(ELITE.maxPerWave, c); k++) {
        const type = this.rng.weightedIndex(this.weights);
        if (type >= 0) this.spawnAroundPlayer(world, type, true);
      }
      this.weights[exploder] = saved;
    }

    this.recycleFarEnemies(world);
  }

  /** Kan Ayı: çizelge 8:00 karışımından yeniden başlar, kısa bir sakinlikten sonra. */
  startCycle(world: World): void {
    this.eventCursor = WAVE_EVENTS.findIndex((e) => e.at >= CYCLE.timelineStart);
    if (this.eventCursor < 0) this.eventCursor = WAVE_EVENTS.length;
    this.calmUntil = world.time + CYCLE.calm;
    this.nextElite = world.time + 30;
    this.credit = 0;
    this.pending = -1;
  }

  /** Olay sayısı Kan Ayı'nda ve lanetle büyür. */
  eventCount(world: World, ev: WaveEvent): number {
    const curse = Math.max(0, world.stats.get('curse'));
    return Math.round(ev.count * CYCLE.eventCount ** (world.cycle - 1) * (1 + 0.5 * curse));
  }

  fireEvent(world: World, ev: WaveEvent, index: number): void {
    const type = ENEMY_INDEX[ev.enemy];
    if (type === undefined) return;
    const n = this.eventCount(world, ev);
    const cap = this.eventCap(world);
    if (cap <= 0) return;
    if (ev.kind === 'ring') this.spawnRing(world, type, n, ev.radius ?? S.ringRadius, cap);
    else if (ev.kind === 'swarm') this.spawnSwarm(world, type, n, cap);
    else this.spawnHorde(world, type, n, cap);
    world.announceFx.push(ANN_EVENT, index, n);
  }

  spawnAroundPlayer(world: World, type: number, elite = false): boolean {
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
      return world.spawnEnemy(type, x, z, elite) >= 0;
    }
    return false;
  }

  /** Oyuncuyu çevreleyen çember. */
  spawnRing(world: World, type: number, n: number, radius: number, cap = world.enemyCap): void {
    const p = world.player;
    for (let k = 0; k < n && world.enemies.count < cap; k++) {
      const a = (k / n) * Math.PI * 2;
      const x = world.terrain.clampToPlayable(p.x + Math.sin(a) * radius);
      const z = world.terrain.clampToPlayable(p.z + Math.cos(a) * radius);
      if (world.spawnEnemy(type, x, z) >= 0) this.spawned[type]++;
    }
  }

  /** Hareket yönünde 30 m ötede tek bir küme. */
  private spawnSwarm(world: World, type: number, n: number, cap: number): void {
    const p = world.player;
    const a =
      (p.speed > 1 ? Math.atan2(p.vx, p.vz) : this.rng.range(0, Math.PI * 2)) + this.rng.gaussian() * 0.5;
    const cx = p.x + Math.sin(a) * 30;
    const cz = p.z + Math.cos(a) * 30;
    for (let k = 0; k < n && world.enemies.count < cap; k++) {
      const x = world.terrain.clampToPlayable(cx + this.rng.gaussian() * 3.5);
      const z = world.terrain.clampToPlayable(cz + this.rng.gaussian() * 3.5);
      if (world.spawnEnemy(type, x, z) >= 0) this.spawned[type]++;
    }
  }

  /** Bir yönden iki sıra halinde 100°'lik yay: duvar gibi gelen akın. */
  private spawnHorde(world: World, type: number, n: number, cap: number): void {
    const p = world.player;
    const base = p.speed > 1 ? Math.atan2(p.vx, p.vz) : this.rng.range(0, Math.PI * 2);
    const arc = (100 * Math.PI) / 180;
    const perRow = Math.ceil(n / 2);
    for (let k = 0; k < n && world.enemies.count < cap; k++) {
      const row = k < perRow ? 0 : 1;
      const j = row === 0 ? k : k - perRow;
      const a = base - arc / 2 + (arc * (j + 0.5 * row)) / perRow;
      const r = 32 + row * 2.2;
      const x = world.terrain.clampToPlayable(p.x + Math.sin(a) * r);
      const z = world.terrain.clampToPlayable(p.z + Math.cos(a) * r);
      if (world.spawnEnemy(type, x, z) >= 0) this.spawned[type]++;
    }
  }

  private recycleFarEnemies(world: World): void {
    const e = world.enemies;
    const p = world.player;
    const d2max = S.despawnDistance * S.despawnDistance;
    const moving = p.speed > 1;
    const base = moving ? Math.atan2(p.vx, p.vz) : 0;
    for (let i = 0; i < e.count; i++) {
      if (e.dead[i] || e.flags[i] & (EF_BOSS | EF_SPECIAL)) continue;
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
