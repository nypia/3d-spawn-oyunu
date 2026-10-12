import { Rng } from '../../core/Rng';
import { BALANCE, xpToNext } from '../../data/balance';
import { ENEMIES } from '../../data/enemies';
import { TOMES } from '../../data/tomes';
import { WEAPON_INDEX, WEAPONS } from '../../data/weapons';
import { ProjectilePool } from '../combat/ProjectilePool';
import { EnemyPool } from '../enemies/EnemyPool';
import { SpawnDirector } from '../enemies/SpawnDirector';
import { GemPool } from '../pickups/GemPool';
import { Player, type PlayerInput } from '../player/Player';
import { rollUpgrades, type UpgradeOption } from '../progression/Upgrades';
import { SpatialGrid } from '../spatial/SpatialGrid';
import { Stats } from '../stats/Stats';
import { Heightmap } from '../terrain/Heightmap';
import { createWeapon, levelUpWeapon, updateWeapon, type WeaponInstance } from '../weapons/Weapons';
import { EventRing } from './EventRing';
import { Obstacles } from './Obstacles';

export interface WorldOptions {
  seed: number;
  /** Aynı anda en fazla kaç düşman (masaüstü/mobil farklı). */
  enemyCap?: number;
  godMode?: boolean;
  startWeapon?: string;
}

const PB = BALANCE.player;
const XB = BALANCE.xp;

/**
 * Tüm oyun durumu ve kuralları. Render'dan tamamen bağımsızdır (three.js import etmez),
 * bu yüzden Node'da headless olarak çalıştırılıp test edilebilir.
 */
export class World {
  readonly seed: number;
  readonly rng: Rng;
  readonly terrain: Heightmap;
  readonly obstacles: Obstacles;
  readonly player = new Player();
  readonly stats: Stats;
  readonly enemies: EnemyPool;
  readonly projectiles = new ProjectilePool(768);
  readonly gems = new GemPool(XB.gemCapacity);
  readonly enemyGrid: SpatialGrid;
  readonly director: SpawnDirector;
  readonly weapons: WeaponInstance[] = [];
  readonly tomeLevels: number[] = TOMES.map(() => 0);

  /** Render/ses için olay akışları. death: x,y,z,type · hit: x,y,z,hasar,kritik */
  readonly deathFx = new EventRing(256, 4);
  readonly hitFx = new EventRing(512, 5);

  enemyCap: number;
  godMode: boolean;

  time = 0;
  tick = 0;
  kills = 0;
  level = 1;
  xp = 0;
  xpNext = xpToNext(1);
  pendingLevelUps = 0;
  /** Doluysa oyun durur ve oyuncudan seçim beklenir. */
  offer: UpgradeOption[] | null = null;
  gameOver = false;
  /** Render için: Ateş Halesi yarıçapı (0 = yok). */
  auraRadius = 0;
  damageDealt = 0;

  private readonly buf = new Int32Array(4096);
  private readonly topDist = new Float32Array(16);
  private readonly tmp2 = new Float32Array(2);

  constructor(opts: WorldOptions) {
    this.seed = opts.seed;
    const root = new Rng(opts.seed);
    const mapRng = root.fork();
    this.rng = root.fork();
    this.enemyCap = opts.enemyCap ?? BALANCE.spawn.capDesktop;
    this.godMode = opts.godMode ?? false;

    const A = BALANCE.arena;
    this.terrain = new Heightmap(mapRng, {
      size: A.size,
      cell: A.cell,
      wallBand: A.wallBand,
      spawnFlatRadius: A.spawnFlatRadius,
    });
    this.obstacles = new Obstacles(mapRng, this.terrain, 380, 140);

    this.stats = new Stats({ maxHp: PB.baseHp, moveSpeed: PB.baseMoveSpeed, pickupRange: PB.pickupRange });
    this.enemies = new EnemyPool(Math.max(1200, this.enemyCap));
    this.enemyGrid = new SpatialGrid(A.size, 4, this.enemies.capacity);
    this.director = new SpawnDirector(this.rng);

    this.player.y = this.terrain.heightAt(0, 0);
    this.player.maxHp = this.player.hp = this.stats.get('maxHp');
    this.weapons.push(createWeapon(WEAPONS[WEAPON_INDEX[opts.startWeapon ?? 'magicBolt']]));
  }

  get paused(): boolean {
    return this.gameOver || this.offer !== null;
  }

  step(input: PlayerInput, dt: number): void {
    if (this.paused) return;
    this.time += dt;
    this.tick++;

    const p = this.player;
    p.update(input, this.stats, this.terrain, dt);
    this.obstacles.resolve(p.x, p.z, PB.radius, this.tmp2);
    p.x = this.tmp2[0];
    p.z = this.tmp2[1];

    const e = this.enemies;
    this.enemyGrid.rebuild(e.count, e.x, e.z);

    for (const w of this.weapons) updateWeapon(this, w, dt);
    this.updateProjectiles(dt);
    this.updateEnemies(dt);
    this.updateGems(dt);
    this.director.update(this, dt);

    e.removeDead();
    this.projectiles.removeDead();
    this.gems.removeDead();

    p.maxHp = this.stats.get('maxHp');
    p.hp = Math.min(p.maxHp, p.hp + this.stats.get('regen') * dt);
    if (p.hp <= 0) {
      if (this.godMode) p.hp = p.maxHp;
      else {
        p.hp = 0;
        this.gameOver = true;
      }
    }
    if (!this.gameOver && this.pendingLevelUps > 0 && !this.offer) this.offer = rollUpgrades(this, this.rng);
  }

  // ---------------------------------------------------------------- Seviye atlama

  choose(index: number): void {
    if (!this.offer) return;
    const opt = this.offer[index];
    if (!opt) return;
    this.applyUpgrade(opt);
    this.offer = null;
    this.pendingLevelUps--;
    if (this.pendingLevelUps > 0) this.offer = rollUpgrades(this, this.rng);
  }

  applyUpgrade(opt: UpgradeOption): void {
    const p = this.player;
    switch (opt.kind) {
      case 'weaponNew':
        this.weapons.push(createWeapon(WEAPONS[opt.weapon]));
        break;
      case 'weaponLevel': {
        const w = this.weapons.find((x) => x.def === WEAPONS[opt.weapon]);
        if (w) levelUpWeapon(w);
        break;
      }
      case 'tome': {
        const d = TOMES[opt.tome];
        this.tomeLevels[opt.tome]++;
        if (d.mode === 'mult') this.stats.addMult(d.stat, d.perLevel);
        else this.stats.addFlat(d.stat, d.perLevel);
        if (d.stat === 'maxHp') {
          p.maxHp = this.stats.get('maxHp');
          p.hp = Math.min(p.maxHp, p.hp + d.perLevel);
        }
        break;
      }
      case 'heal':
        p.hp = Math.min(p.maxHp, p.hp + opt.amount);
        break;
    }
  }

  addXp(amount: number): void {
    this.xp += amount * this.stats.get('xpGain');
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpToNext(this.level);
      this.pendingLevelUps++;
    }
  }

  // ---------------------------------------------------------------- Düşmanlar

  spawnEnemy(type: number, x: number, z: number): number {
    const d = ENEMIES[type];
    const e = this.enemies;
    const i = e.add(type);
    if (i < 0) return -1;
    const hpMul = this.director.hpMultiplier(this.time);
    e.x[i] = x;
    e.z[i] = z;
    e.y[i] = this.terrain.heightAt(x, z);
    e.hp[i] = e.maxHp[i] = d.hp * hpMul;
    e.damage[i] = d.damage * this.director.damageMultiplier(this.time);
    e.speed[i] = d.speed * this.rng.range(0.88, 1.12);
    e.radius[i] = d.radius;
    e.hover[i] = d.hover;
    e.knockResist[i] = d.knockbackResist;
    e.xp[i] = d.xp;
    e.phase[i] = this.rng.range(0, Math.PI * 2);
    return i;
  }

  private updateEnemies(dt: number): void {
    const e = this.enemies;
    const p = this.player;
    const buf = this.buf;
    const tmp = this.tmp2;
    const knockDecay = Math.exp(-7 * dt);
    const pr = PB.radius;
    const armor = this.stats.get('armor');

    for (let i = 0; i < e.count; i++) {
      if (e.dead[i]) continue;
      e.contactCd[i] -= dt;
      if (e.flash[i] > 0) e.flash[i] -= dt;

      const x = e.x[i];
      const z = e.z[i];
      const dx = p.x - x;
      const dz = p.z - z;
      const dist = Math.hypot(dx, dz) || 1e-4;
      const sp = e.speed[i];
      const vx = (dx / dist) * sp;
      const vz = (dz / dist) * sp;
      e.vx[i] = vx;
      e.vz[i] = vz;

      // Ayrışma (uzaktakiler için 3 tick'te bir — LOD).
      let sx = 0;
      let sz = 0;
      if (dist < 30 || (i + this.tick) % 3 === 0) {
        const ri = e.radius[i];
        const n = this.enemyGrid.query(x, z, ri + 0.7, buf);
        for (let k = 0; k < n; k++) {
          const j = buf[k];
          if (j === i || e.dead[j]) continue;
          const ox = x - e.x[j];
          const oz = z - e.z[j];
          const minD = ri + e.radius[j];
          const d2 = ox * ox + oz * oz;
          if (d2 >= minD * minD) continue;
          const d = Math.sqrt(d2);
          if (d < 1e-4) {
            sx += (i & 1 ? 1 : -1) * 0.05;
            continue;
          }
          const push = (minD - d) * 0.5;
          sx += (ox / d) * push;
          sz += (oz / d) * push;
        }
        const sl = Math.hypot(sx, sz);
        if (sl > 0.25) {
          sx *= 0.25 / sl;
          sz *= 0.25 / sl;
        }
      }

      e.kx[i] *= knockDecay;
      e.kz[i] *= knockDecay;
      let nx = x + (vx + e.kx[i]) * dt + sx;
      let nz = z + (vz + e.kz[i]) * dt + sz;

      this.obstacles.resolve(nx, nz, e.radius[i], tmp);
      nx = this.terrain.clampToPlayable(tmp[0]);
      nz = this.terrain.clampToPlayable(tmp[1]);
      e.x[i] = nx;
      e.z[i] = nz;
      e.y[i] = this.terrain.heightAt(nx, nz);

      // Oyuncu ile temas: iç içe girmesinler, temas hasarı uygula.
      const cx = p.x - nx;
      const cz = p.z - nz;
      const minD = e.radius[i] + pr;
      const c2 = cx * cx + cz * cz;
      const ey = e.y[i] + e.hover[i];
      if (c2 < minD * minD && Math.abs(ey - p.y) < 1.3) {
        const d = Math.sqrt(c2) || 1e-4;
        const overlap = minD - d;
        e.x[i] -= (cx / d) * overlap * 0.7;
        e.z[i] -= (cz / d) * overlap * 0.7;
        p.x += (cx / d) * overlap * 0.3;
        p.z += (cz / d) * overlap * 0.3;
        if (e.contactCd[i] <= 0) {
          e.contactCd[i] = PB.contactCooldown;
          p.takeDamage(e.damage[i], armor);
        }
      }
    }
    p.x = this.terrain.clampToPlayable(p.x);
    p.z = this.terrain.clampToPlayable(p.z);
  }

  /** Hasar uygular (kritik, geri itme, ölüm). Ham hasar oyuncunun hasar çarpanıyla ölçeklenir. */
  damageEnemy(i: number, base: number, kx: number, kz: number): void {
    const e = this.enemies;
    if (e.dead[i]) return;
    let dmg = base * this.stats.get('damage');
    const crit = this.rng.chance(this.stats.get('critChance'));
    if (crit) dmg *= this.stats.get('critDamage');
    e.hp[i] -= dmg;
    e.flash[i] = 0.12;
    const k = (1 - e.knockResist[i]) * this.stats.get('knockback');
    e.kx[i] += kx * k;
    e.kz[i] += kz * k;
    this.damageDealt += dmg;
    this.hitFx.push(e.x[i], e.y[i] + e.hover[i] + 1, e.z[i], dmg, crit ? 1 : 0);
    if (e.hp[i] <= 0) this.killEnemy(i);
  }

  killEnemy(i: number): void {
    const e = this.enemies;
    e.dead[i] = 1;
    this.kills++;
    const gy = this.terrain.heightAt(e.x[i], e.z[i]) + 0.35;
    this.gems.add(e.x[i], gy, e.z[i], e.xp[i]);
    this.deathFx.push(e.x[i], e.y[i] + e.hover[i], e.z[i], e.type[i]);
  }

  /** Bir küre içindeki tüm düşmanlara hasar (aura, patlama). */
  damageInRadius(x: number, y: number, z: number, r: number, base: number, knock: number): void {
    const e = this.enemies;
    const n = this.enemyGrid.query(x, z, r + 1, this.buf);
    for (let k = 0; k < n; k++) {
      const j = this.buf[k];
      if (j >= e.count || e.dead[j]) continue;
      const dx = e.x[j] - x;
      const dz = e.z[j] - z;
      const rr = r + e.radius[j];
      const d2 = dx * dx + dz * dz;
      if (d2 > rr * rr || Math.abs(e.y[j] + e.hover[j] - y) > 2.5) continue;
      const d = Math.sqrt(d2) || 1e-4;
      this.damageEnemy(j, base, (dx / d) * knock, (dz / d) * knock);
    }
  }

  /**
   * (x,z)'ye en yakın k canlı düşmanı out'a yazar (yakından uzağa). Bulunan sayıyı döner.
   * Önce küçük yarıçapta arar, yetmezse genişletir.
   */
  findNearestEnemies(x: number, z: number, maxR: number, k: number, out: Int32Array): number {
    const e = this.enemies;
    const dist = this.topDist;
    let found = 0;
    for (const r of [8, 16, maxR]) {
      const rad = Math.min(r, maxR);
      found = 0;
      const n = this.enemyGrid.query(x, z, rad, this.buf);
      const r2 = rad * rad;
      for (let q = 0; q < n; q++) {
        const j = this.buf[q];
        if (j >= e.count || e.dead[j]) continue;
        const dx = e.x[j] - x;
        const dz = e.z[j] - z;
        const d2 = dx * dx + dz * dz;
        if (d2 > r2) continue;
        // Sıralı ekleme (k küçük).
        if (found < k) found++;
        else if (d2 >= dist[found - 1]) continue;
        let pos = found - 1;
        while (pos > 0 && dist[pos - 1] > d2) {
          dist[pos] = dist[pos - 1];
          out[pos] = out[pos - 1];
          pos--;
        }
        dist[pos] = d2;
        out[pos] = j;
      }
      if (found >= k || rad >= maxR) break;
    }
    return found;
  }

  // ---------------------------------------------------------------- Mermiler

  spawnProjectile(
    kind: number,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    damage: number,
    radius: number,
    pierce: number,
    knockback: number,
    homing: number,
  ): void {
    const pr = this.projectiles;
    const i = pr.add();
    if (i < 0) return;
    pr.kind[i] = kind;
    pr.x[i] = x;
    pr.y[i] = y;
    pr.z[i] = z;
    pr.vx[i] = vx;
    pr.vy[i] = vy;
    pr.vz[i] = vz;
    pr.life[i] = life;
    pr.damage[i] = damage;
    pr.radius[i] = radius;
    pr.pierceLeft[i] = Math.max(1, pierce);
    pr.knockback[i] = knockback;
    pr.homing[i] = homing;
  }

  private readonly homingTarget = new Int32Array(1);

  private updateProjectiles(dt: number): void {
    const pr = this.projectiles;
    const e = this.enemies;
    for (let i = 0; i < pr.count; i++) {
      if (pr.dead[i]) continue;
      pr.life[i] -= dt;
      if (pr.life[i] <= 0) {
        pr.dead[i] = 1;
        continue;
      }

      // Hedef takibi (4 tick'te bir yeni hedef seç).
      if (pr.homing[i] > 0 && (i + this.tick) % 4 === 0) {
        if (this.findNearestEnemies(pr.x[i], pr.z[i], 9, 1, this.homingTarget) > 0) {
          const t = this.homingTarget[0];
          if (!pr.hasHit(i, e.uid[t])) {
            const speed = Math.hypot(pr.vx[i], pr.vy[i], pr.vz[i]);
            let dx = e.x[t] - pr.x[i];
            let dy = e.y[t] + e.hover[t] + 0.5 - pr.y[i];
            let dz = e.z[t] - pr.z[i];
            const len = Math.hypot(dx, dy, dz) || 1;
            dx = (dx / len) * speed;
            dy = (dy / len) * speed;
            dz = (dz / len) * speed;
            const blend = Math.min(1, pr.homing[i] * dt * 2);
            const nvx = pr.vx[i] + (dx - pr.vx[i]) * blend;
            const nvy = pr.vy[i] + (dy - pr.vy[i]) * blend;
            const nvz = pr.vz[i] + (dz - pr.vz[i]) * blend;
            const nl = Math.hypot(nvx, nvy, nvz) || 1;
            pr.vx[i] = (nvx / nl) * speed;
            pr.vy[i] = (nvy / nl) * speed;
            pr.vz[i] = (nvz / nl) * speed;
          }
        }
      }

      pr.x[i] += pr.vx[i] * dt;
      pr.y[i] += pr.vy[i] * dt;
      pr.z[i] += pr.vz[i] * dt;
      if (pr.y[i] < this.terrain.heightAt(pr.x[i], pr.z[i]) - 0.3) {
        pr.dead[i] = 1;
        continue;
      }

      // Çarpışma
      const r = pr.radius[i];
      const n = this.enemyGrid.query(pr.x[i], pr.z[i], r + 0.8, this.buf);
      for (let k = 0; k < n; k++) {
        const j = this.buf[k];
        if (j >= e.count || e.dead[j]) continue;
        const dx = e.x[j] - pr.x[i];
        const dz = e.z[j] - pr.z[i];
        const rr = r + e.radius[j];
        if (dx * dx + dz * dz > rr * rr) continue;
        const ey = e.y[j] + e.hover[j] + 0.5;
        if (Math.abs(ey - pr.y[i]) > 0.9 + r) continue;
        if (pr.hasHit(i, e.uid[j])) continue;
        pr.rememberHit(i, e.uid[j]);
        const sp = Math.hypot(pr.vx[i], pr.vz[i]) || 1;
        const kb = pr.knockback[i];
        this.damageEnemy(j, pr.damage[i], (pr.vx[i] / sp) * kb, (pr.vz[i] / sp) * kb);
        pr.pierceLeft[i]--;
        if (pr.pierceLeft[i] === 0) {
          pr.dead[i] = 1;
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------------- XP taşları

  private updateGems(dt: number): void {
    const g = this.gems;
    const p = this.player;
    const range = this.stats.get('pickupRange');
    const r2 = range * range;
    const ty = p.y + 0.8;
    const collect2 = XB.collectRadius * XB.collectRadius;
    for (let i = 0; i < g.count; i++) {
      if (g.dead[i]) continue;
      const dx = p.x - g.x[i];
      const dy = ty - g.y[i];
      const dz = p.z - g.z[i];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (g.pull[i] === 0) {
        if (dx * dx + dz * dz < r2) g.pull[i] = XB.magnetBaseSpeed;
        else continue;
      }
      if (d2 < collect2) {
        g.dead[i] = 1;
        this.addXp(g.value[i]);
        continue;
      }
      g.pull[i] += XB.magnetAccel * dt;
      const d = Math.sqrt(d2);
      const step = Math.min(d, g.pull[i] * dt);
      g.x[i] += (dx / d) * step;
      g.y[i] += (dy / d) * step;
      g.z[i] += (dz / d) * step;
    }
  }

  // ---------------------------------------------------------------- Hile / hata ayıklama

  /** Oyuncunun etrafına n düşman doğurur (bench ve hile tuşları). */
  spawnBurst(n: number, minR = 10, maxR = 40): void {
    const p = this.player;
    for (let k = 0; k < n && this.enemies.count < this.enemies.capacity; k++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(minR, maxR);
      const type = this.rng.int(0, ENEMIES.length - 1);
      this.spawnEnemy(
        type,
        this.terrain.clampToPlayable(p.x + Math.sin(a) * r),
        this.terrain.clampToPlayable(p.z + Math.cos(a) * r),
      );
    }
  }
}
