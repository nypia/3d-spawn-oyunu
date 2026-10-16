import { ATTACK_KINDS, BOSS, BOSSES, type BossAttack, type BossDef } from '../../data/bosses';
import { CHEST_BOSS } from '../../data/chests';
import { ENEMY_INDEX, SHOT_ORB } from '../../data/enemies';
import { HZ_BOULDER, HZ_CIRCLE, HZ_GLOB, HZ_LINE, HZF_VISUAL } from '../combat/Hazards';
import { PICKUP_GOLD } from '../pickups/PickupPool';
import { ANN_BOSS_DEAD, ANN_BOSS_SPAWN, ANN_BOSS_WARN } from '../world/announce';
import type { World } from '../world/World';
import { EF_BOSS, EF_SUMMON, ST_ACT, ST_MOVE, ST_RECOVER, ST_WINDUP } from './EnemyPool';

/** Sahnedeki bir boss'un yapay zekâ durumu (düşman havuzunda `uid` ile bulunur). */
export interface ActiveBoss {
  uid: number;
  /** BOSSES indeksi. */
  index: number;
  def: BossDef;
  attacks: BossAttack[];
  timers: number[];
  enraged: boolean;
  /** Süren saldırı (attacks indeksi, −1 = yok) ve alt adım (atılma zinciri). */
  attack: number;
  step: number;
  /** Faz sayacı (s). */
  t: number;
  dur: number;
  /** Hedef ve başlangıç (zıplama). */
  tx: number;
  tz: number;
  sx: number;
  sz: number;
}

/** Zıplayan boss'un tepe yüksekliği (m). */
const HOP_HEIGHT = 3.5;

/**
 * Boss zamanlaması ve saldırıları. Hareket World.updateEnemies'te ('boss' davranışı) bu sınıfın
 * `steer`'ı ile yönlenir; saldırılar gecikmeli tehlike alanları (Hazards), çağrılan yardımcılar ve
 * küre dalgalarıyla yapılır.
 */
export class BossController {
  readonly active: ActiveBoss[] = [];
  /** Sıradaki boss (BOSSES indeksi). */
  next = 0;
  warned = false;
  lastSpawnAt = Number.NEGATIVE_INFINITY;
  killed = 0;

  /** Kan Ayı: boss sırası baştan. */
  resetCycle(): void {
    this.next = 0;
    this.warned = false;
  }

  /** Sıradaki boss'un doğacağı an: döngü başına 20 dk'lık takvim, iki boss arası en az `minGap`. */
  dueAt(world: World): number {
    const def = BOSSES[this.next];
    if (!def) return Number.POSITIVE_INFINITY;
    return Math.max((world.cycle - 1) * 1200 + def.at, this.lastSpawnAt + BOSS.minGap);
  }

  update(world: World): void {
    const def = BOSSES[this.next];
    if (!def) return;
    const due = this.dueAt(world);
    // Hile ile zaman atlandıysa ara boss'ları atla (final hiçbir zaman atlanmaz).
    if (!def.final && world.time - due > BOSS.staleSkip) {
      this.next++;
      this.warned = false;
      return;
    }
    if (!this.warned && world.time >= due - BOSS.warn) {
      this.warned = true;
      world.announceFx.push(ANN_BOSS_WARN, this.next, world.cycle);
    }
    if (world.time >= due && this.spawn(world, this.next)) {
      this.next++;
      this.warned = false;
    }
  }

  /** Boss'u oyuncunun önüne doğurur. */
  spawn(world: World, index: number): boolean {
    const def = BOSSES[index];
    const p = world.player;
    const a = p.speed > 1 ? Math.atan2(p.vx, p.vz) : world.rng.range(0, Math.PI * 2);
    const x = world.terrain.clampToPlayable(p.x + Math.sin(a) * BOSS.spawnDist);
    const z = world.terrain.clampToPlayable(p.z + Math.cos(a) * BOSS.spawnDist);
    const hpMul = (1 + BOSS.hpPerLevel * world.level) * BOSS.cycleHp ** (world.cycle - 1);
    const i = world.spawnEnemy(ENEMY_INDEX[def.enemy], x, z, false, { hpMul, flags: EF_BOSS });
    if (i < 0) return false;
    const e = world.enemies;
    e.knockResist[i] = 1;
    this.active.push({
      uid: e.uid[i],
      index,
      def,
      attacks: [...def.attacks],
      timers: def.attacks.map((t) => t.cooldown * world.rng.range(0.3, 0.6)),
      enraged: false,
      attack: -1,
      step: 0,
      t: 0,
      dur: 0,
      tx: 0,
      tz: 0,
      sx: 0,
      sz: 0,
    });
    this.lastSpawnAt = world.time;
    world.announceFx.push(ANN_BOSS_SPAWN, index, world.cycle);
    world.shake(0.6);
    return true;
  }

  find(uid: number): ActiveBoss | undefined {
    for (const b of this.active) if (b.uid === uid) return b;
    return undefined;
  }

  /** HUD: sahnedeki boss'ların adı, can oranı ve rengi. */
  bars(world: World): { name: string; frac: number; color: number }[] {
    const e = world.enemies;
    const out: { name: string; frac: number; color: number }[] = [];
    for (const b of this.active) {
      for (let i = 0; i < e.count; i++) {
        if (e.uid[i] !== b.uid || e.dead[i]) continue;
        const name = world.cycle > 1 ? `Kanlı ${b.def.name}` : b.def.name;
        out.push({ name, frac: Math.max(0, e.hp[i] / e.maxHp[i]), color: b.def.color });
      }
    }
    return out;
  }

  private damage(world: World, base: number): number {
    return base * world.director.damageMultiplier(world.time, world.cycle) * world.mods.enemyDamage;
  }

  /**
   * Boss'un bu tick'teki hareketi: `out` = [yön x, yön z, hız]. `ux,uz` oyuncuya birim yön.
   */
  steer(world: World, i: number, ux: number, uz: number, dist: number, dt: number, out: Float32Array): void {
    const e = world.enemies;
    let sp = e.speed[i] * (dist > BOSS.catchUpDist ? BOSS.catchUpMul : 1);
    out[0] = ux;
    out[1] = uz;
    out[2] = sp;
    const b = this.find(e.uid[i]);
    if (!b) return;
    if (!b.enraged && b.def.enrage && e.hp[i] <= e.maxHp[i] * b.def.enrage.at) {
      b.enraged = true;
      for (const a of b.def.enrage.attacks) {
        b.attacks.push(a);
        b.timers.push(a.cooldown * 0.3);
      }
    }
    const st = e.state[i];
    if (st === ST_MOVE) {
      for (let k = 0; k < b.timers.length; k++) b.timers[k] -= dt;
      for (let k = 0; k < b.attacks.length; k++) {
        if (b.timers[k] <= 0 && this.usable(b.attacks[k], dist)) {
          this.start(world, b, i, k, ux, uz);
          out[2] = 0;
          return;
        }
      }
      return;
    }
    b.t -= dt;
    if (st === ST_WINDUP) {
      // Hazırlanırken durur, oyuncuya döner.
      out[2] = 0;
      if (b.t <= 0) this.execute(world, b, i, ux, uz);
      return;
    }
    if (st === ST_ACT) {
      const a = b.attacks[b.attack];
      if (a?.kind === 'hopSlam') {
        const dx = b.tx - b.sx;
        const dz = b.tz - b.sz;
        const len = Math.hypot(dx, dz) || 1e-4;
        const u = 1 - Math.max(0, b.t) / b.dur;
        e.hover[i] = 4 * HOP_HEIGHT * u * (1 - u);
        out[0] = dx / len;
        out[1] = dz / len;
        out[2] = len / b.dur;
      } else {
        out[0] = e.ax[i];
        out[1] = e.az[i];
        out[2] = a && (a.kind === 'dashChain' || a.kind === 'charge') ? a.speed : sp;
      }
      if (b.t <= 0) this.endAct(world, b, i, ux, uz);
      return;
    }
    // Toparlanma.
    sp *= 0.2;
    out[2] = sp;
    if (b.t <= 0) {
      e.state[i] = ST_MOVE;
      b.attack = -1;
    }
  }

  private usable(a: BossAttack, dist: number): boolean {
    if (a.kind === 'slam') return dist < a.range;
    if (a.kind === 'throw') return dist > a.minRange && dist < 40;
    if (a.kind === 'hopSlam' || a.kind === 'dashChain' || a.kind === 'charge') return dist < 26;
    return dist < 32;
  }

  private cooldownMul(world: World): number {
    return Math.max(BOSS.minCooldownMul, BOSS.cycleCooldown ** (world.cycle - 1));
  }

  private windup(b: ActiveBoss, e: World['enemies'], i: number, t: number): void {
    e.state[i] = ST_WINDUP;
    b.t = b.dur = t;
  }

  /** Atılma/hücum yolunu yerde çizgiyle göster. */
  private lockDash(
    world: World,
    i: number,
    ux: number,
    uz: number,
    speed: number,
    time: number,
    delay: number,
  ): void {
    const e = world.enemies;
    e.ax[i] = ux;
    e.az[i] = uz;
    const len = speed * time;
    world.hazards.add(
      HZ_LINE,
      e.x[i],
      e.z[i],
      e.radius[i] * 0.8,
      delay,
      0,
      e.x[i] + ux * len,
      e.z[i] + uz * len,
      HZF_VISUAL,
    );
  }

  private start(world: World, b: ActiveBoss, i: number, k: number, ux: number, uz: number): void {
    const e = world.enemies;
    const a = b.attacks[k];
    b.attack = k;
    b.step = 0;
    b.timers[k] = a.cooldown * this.cooldownMul(world);
    world.telegraphFx.push(e.x[i], e.z[i], ATTACK_KINDS.indexOf(a.kind));
    switch (a.kind) {
      case 'dashChain':
        this.windup(b, e, i, a.windup);
        this.lockDash(world, i, ux, uz, a.speed, a.time, a.windup);
        break;
      case 'charge':
        this.windup(b, e, i, a.windup);
        this.lockDash(world, i, ux, uz, a.speed, a.time, a.windup);
        break;
      case 'slam':
        this.windup(b, e, i, a.windup);
        world.hazards.add(HZ_CIRCLE, e.x[i], e.z[i], a.radius, a.windup, this.damage(world, a.damage));
        break;
      case 'summon':
        this.windup(b, e, i, 0.7);
        break;
      case 'nova':
      case 'rain':
        this.windup(b, e, i, 0.6);
        break;
      default:
        this.windup(b, e, i, 0.45);
    }
  }

  private execute(world: World, b: ActiveBoss, i: number, ux: number, uz: number): void {
    const e = world.enemies;
    const p = world.player;
    const a = b.attacks[b.attack];
    const recover = (t: number) => {
      e.state[i] = ST_RECOVER;
      b.t = b.dur = t;
    };
    if (!a) {
      recover(0.3);
      return;
    }
    switch (a.kind) {
      case 'hopSlam': {
        b.sx = e.x[i];
        b.sz = e.z[i];
        b.tx = world.terrain.clampToPlayable(p.x);
        b.tz = world.terrain.clampToPlayable(p.z);
        e.state[i] = ST_ACT;
        b.t = b.dur = a.air;
        world.hazards.add(HZ_CIRCLE, b.tx, b.tz, a.radius, a.air, this.damage(world, a.damage));
        return;
      }
      case 'rain': {
        for (let k = 0; k < a.count; k++) {
          const r = k === 0 ? 0 : world.rng.range(1.5, a.spread);
          const ang = world.rng.range(0, Math.PI * 2);
          const x = world.terrain.clampToPlayable(p.x + Math.sin(ang) * r);
          const z = world.terrain.clampToPlayable(p.z + Math.cos(ang) * r);
          world.hazards.add(HZ_GLOB, x, z, a.radius, 1 + k * 0.12, this.damage(world, a.damage), x, z);
        }
        recover(0.4);
        return;
      }
      case 'dashChain':
      case 'charge':
        e.state[i] = ST_ACT;
        b.t = b.dur = a.time;
        return;
      case 'summon': {
        const type = ENEMY_INDEX[a.enemy];
        for (let k = 0; k < a.count; k++) {
          const ang = (k / a.count) * Math.PI * 2;
          const r = e.radius[i] + 2.5;
          const x = world.terrain.clampToPlayable(e.x[i] + Math.sin(ang) * r);
          const z = world.terrain.clampToPlayable(e.z[i] + Math.cos(ang) * r);
          world.spawnEnemy(type, x, z, false, { flags: EF_SUMMON });
        }
        recover(0.4);
        return;
      }
      case 'slam':
        world.shake(0.35);
        recover(0.5);
        return;
      case 'throw':
        world.hazards.add(
          HZ_BOULDER,
          p.x,
          p.z,
          a.radius,
          a.flight,
          this.damage(world, a.damage),
          e.x[i],
          e.z[i],
        );
        recover(0.4);
        return;
      case 'spikeLines': {
        const base = Math.atan2(ux, uz);
        for (let k = 0; k < a.lines; k++) {
          const ang = base + (k - (a.lines - 1) / 2) * 0.42;
          world.hazards.add(
            HZ_LINE,
            e.x[i],
            e.z[i],
            a.width,
            1,
            this.damage(world, a.damage),
            e.x[i] + Math.sin(ang) * a.length,
            e.z[i] + Math.cos(ang) * a.length,
          );
        }
        recover(0.5);
        return;
      }
      case 'spikeRing': {
        for (let q = 0; q < a.rings; q++) {
          const R = 3.5 + q * 3.2;
          const n = Math.ceil((Math.PI * 2 * R) / 2.6);
          for (let k = 0; k < n; k++) {
            const ang = (k / n) * Math.PI * 2 + q * 0.3;
            world.hazards.add(
              HZ_CIRCLE,
              e.x[i] + Math.sin(ang) * R,
              e.z[i] + Math.cos(ang) * R,
              1.4,
              0.9 + q * 0.45,
              this.damage(world, a.damage),
            );
          }
        }
        recover(0.6);
        return;
      }
      case 'nova': {
        const y = e.y[i] + e.hover[i] + 1;
        for (let k = 0; k < a.count; k++) {
          const ang = (k / a.count) * Math.PI * 2;
          world.spawnEnemyShot(
            e.x[i],
            y,
            e.z[i],
            Math.sin(ang),
            Math.cos(ang),
            a.speed,
            this.damage(world, a.damage),
            SHOT_ORB,
            0.45,
            4,
            0,
          );
        }
        recover(0.4);
        return;
      }
    }
  }

  private endAct(world: World, b: ActiveBoss, i: number, ux: number, uz: number): void {
    const e = world.enemies;
    const a = b.attacks[b.attack];
    e.hover[i] = 0;
    if (a?.kind === 'dashChain' && ++b.step < a.dashes) {
      this.windup(b, e, i, 0.3);
      this.lockDash(world, i, ux, uz, a.speed, a.time, 0.3);
      return;
    }
    if (a?.kind === 'hopSlam') world.shake(0.45);
    e.state[i] = ST_RECOVER;
    b.t = b.dur = a?.kind === 'hopSlam' ? 0.45 : 0.6;
  }

  /** Boss öldü: ödül sandığı, altın, bölünme; final boss'ta Kan Ayı (World). */
  onDeath(world: World, i: number): BossDef | null {
    const e = world.enemies;
    const k = this.active.findIndex((b) => b.uid === e.uid[i]);
    if (k < 0) return null;
    const b = this.active[k];
    this.active.splice(k, 1);
    this.killed++;
    const x = e.x[i];
    const z = e.z[i];
    const y = world.terrain.heightAt(x, z) + 0.4;
    for (let c = 0; c < BOSS.deathGold; c++) world.dropPickup(PICKUP_GOLD, x, y, z, 2);
    const chest = world.interactables.addRewardChest(x, z, world.rng.range(0, Math.PI * 2), CHEST_BOSS);
    if (chest >= 0) world.interactables.level[chest] = b.def.final ? BOSS.finalChestMinRarity : 0;
    const split = b.def.split;
    if (split) {
      const type = ENEMY_INDEX[split.enemy];
      for (let c = 0; c < split.count; c++) {
        const ang = (c / split.count) * Math.PI * 2;
        world.spawnEnemy(type, x + Math.sin(ang) * 2, z + Math.cos(ang) * 2, false, {
          scale: split.scale,
          hpMul: split.hpMul,
          flags: EF_SUMMON,
        });
      }
    }
    world.announceFx.push(ANN_BOSS_DEAD, b.index, world.cycle);
    world.shake(0.5);
    return b.def;
  }
}
