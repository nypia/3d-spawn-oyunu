import { Color, Group, IcosahedronGeometry, MeshLambertMaterial, NormalBlending, type Vector3 } from 'three';
import { ENEMIES } from '../../data/enemies';
import { GEM_TIERS, gemTier } from '../../data/gems';
import { PROJ_BOLT } from '../../sim/combat/ProjectilePool';
import {
  PICKUP_BAG,
  PICKUP_CLOCK,
  PICKUP_GOLD,
  PICKUP_HEAL,
  PICKUP_MAGNET,
  PICKUP_ROSARY,
} from '../../sim/pickups/PickupPool';
import { CHEST, SHRINE, VASE } from '../../sim/world/Interactables';
import { TORCH_FX } from '../../sim/world/Torches';
import { COLLECT_GEM, type World } from '../../sim/world/World';
import type { GameAssets } from '../assets/loadAssets';
import { texturedModel } from '../assets/staticModels';
import type { PulseFx } from '../PulseFx';
import { Debris } from './Debris';
import { type Emit, Particles } from './Particles';
import { SHAPE_DOT, SHAPE_STAR, SpriteBatch } from './Sprites';

const c1 = new Color();

/** Düşman türüne göre ölüm parçaları: iki renk, adet, boy, ek kıvılcım rengi. */
const DEATH: Record<string, { colors: [number, number]; n: number; size: number; spark?: number }> = {
  slime: { colors: [0x6fd35a, 0xa8f08a], n: 6, size: 0.22 },
  skeleton: { colors: [0xeee6d2, 0xc9bfa5], n: 7, size: 0.2 },
  bat: { colors: [0x7a4bd1, 0x4a2c86], n: 4, size: 0.16 },
  exploder: { colors: [0x2b2d3a, 0x45495c], n: 5, size: 0.2, spark: 0xff8a3d },
  archer: { colors: [0x4f8a5b, 0x7a5230], n: 6, size: 0.2 },
  golem: { colors: [0x9a8b78, 0x6f665a], n: 9, size: 0.32, spark: 0x6fe3ff },
  zombie: { colors: [0x6aa84f, 0x8c86c8], n: 7, size: 0.22 },
  ghost: { colors: [0xe8e6ff, 0xb9b4ff], n: 6, size: 0.2, spark: 0xc8c0ff },
  vampire: { colors: [0x2a2030, 0xb3243a], n: 7, size: 0.2, spark: 0xff3a5a },
  keeper: { colors: [0x9a5b2e, 0x3f8f5a], n: 7, size: 0.22, spark: 0xc06bff },
};

/** Sandık patlaması: Sıradan, Nadir, Epik, Efsanevi. */
const CHEST_RARITY_COLOR = [0xffd34a, 0x4fb3ff, 0xc77dff, 0xffb627];

/** Toplanan pickup → ışıltı rengi. */
const PICKUP_SPARK: Record<number, number> = {
  [PICKUP_GOLD]: 0xffd34a,
  [PICKUP_BAG]: 0xffd34a,
  [PICKUP_HEAL]: 0x6dff8a,
  [PICKUP_MAGNET]: 0xff5a5a,
  [PICKUP_CLOCK]: 0x7fe3ff,
  [PICKUP_ROSARY]: 0xfff0a0,
};

/** Bir karede işlenecek en fazla olay (kalabalık anlarında kare düşmesin). */
const MAX_HITS = 40;
const MAX_DEATHS = 30;
const MAX_COLLECTS = 30;
const MAX_TRAILS = 140;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Oyunun parçacık efektleri. Sim'in olay akışlarını (vuruş, ölüm, patlama, kırılma, toplama) ve
 * durumunu (oyuncu hareketi, meşaleler, mermiler, seviye) okuyup havuzlu parçacıklara çevirir:
 * - `glow`: toplamalı kıvılcım ve ışıltılar (bloom'da parlar),
 * - `dust`: normal karışımlı toz ve duman,
 * - `chunks` / `coins`: seken katı parçalar,
 * - `halos`: her kare yeniden dolan parıltı kartları (taş, büyü oku, meşale) — bloom olmayan düşük
 *   kalitede de parlak görünsünler.
 */
export class Effects {
  readonly root = new Group();
  readonly halos: SpriteBatch;
  private readonly glow: Particles;
  private readonly dust: Particles;
  private readonly chunks: Debris;
  private readonly coins: Debris;
  /** Parıltı kartlarının şiddeti: bloom varken düşük (çift parlama olmasın). */
  private readonly haloGain: number;
  private hitCursor = 0;
  private deathCursor = 0;
  private blastCursor = 0;
  private breakCursor = 0;
  private collectCursor = 0;
  private lastLevel = 1;
  private wasGrounded = true;
  private airborne = 0;
  private dustTimer = 0;
  private emberTimer = 0;

  constructor(
    assets: GameAssets,
    lite: boolean,
    bloom: boolean,
    private readonly pulses: PulseFx,
  ) {
    this.haloGain = bloom ? 0.26 : 0.5;
    this.glow = new Particles(lite ? 700 : 1600);
    this.dust = new Particles(lite ? 160 : 360, NormalBlending);
    this.halos = new SpriteBatch(1400);
    this.chunks = new Debris(
      new IcosahedronGeometry(0.5, 0),
      new MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
      lite ? 140 : 300,
    );
    const coin = texturedModel(assets.model('dungeon/coin'));
    coin.geometry.scale(0.75, 0.75, 0.75);
    const coinMat = (coin.material as MeshLambertMaterial).clone();
    coinMat.emissive.setHex(0x5a3c00);
    this.coins = new Debris(coin.geometry, coinMat, 64);
    this.root.add(this.dust.mesh, this.chunks.mesh, this.coins.mesh, this.halos.mesh, this.glow.mesh);
  }

  reset(world: World): void {
    this.glow.clear();
    this.dust.clear();
    this.chunks.clear();
    this.coins.clear();
    this.hitCursor = world.hitFx.written;
    this.deathCursor = world.deathFx.written;
    this.blastCursor = world.blastFx.written;
    this.breakCursor = world.breakFx.written;
    this.collectCursor = world.collectFx.written;
    this.lastLevel = world.level;
    this.wasGrounded = true;
    this.airborne = 0;
  }

  /** Kare başı: parıltı kartları boşaltılır (görünüm sınıfları da ekleyebilir). */
  begin(): void {
    this.halos.begin();
  }

  /** Bir parıltı kartı ekler (renk sRGB hex, şiddet `haloGain` ile ölçeklenir). */
  halo(x: number, y: number, z: number, size: number, hex: number, strength = 1): void {
    c1.setHex(hex).multiplyScalar(strength * this.haloGain);
    this.halos.push(x, y, z, size, c1.r, c1.g, c1.b, 1);
  }

  update(world: World, dt: number, time: number, camera: Vector3): void {
    this.drainEvents(world);
    this.levelUp(world);
    this.heroDust(world, dt);
    this.torches(world, dt, time);
    this.projectiles(world);
    this.pickupHalos(world, time);

    this.glow.update(dt);
    this.dust.update(dt);
    this.chunks.update(world.terrain, dt, camera);
    this.coins.update(world.terrain, dt, camera);
    this.halos.end();
  }

  // ------------------------------------------------------------- yardımcılar

  /** Kıvılcımlar: yukarı eğilimli rastgele yönlerde, hız yönünde uzayan noktalar. */
  private sparks(
    x: number,
    y: number,
    z: number,
    n: number,
    hex: number,
    intensity: number,
    speed: number,
    size: number,
    life: number,
    gravity = 9,
  ): void {
    c1.setHex(hex).multiplyScalar(intensity);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const up = rnd(0.15, 0.95);
      const h = Math.sqrt(1 - up * up);
      const sp = speed * rnd(0.55, 1);
      this.glow.emit({
        x,
        y,
        z,
        vx: Math.cos(a) * h * sp,
        vy: up * sp,
        vz: Math.sin(a) * h * sp,
        life: life * rnd(0.6, 1),
        size,
        endSize: size * 0.3,
        r: c1.r,
        g: c1.g,
        b: c1.b,
        gravity,
        drag: 2.5,
        stretch: 0.07,
      });
    }
  }

  /** Kısa, büyük parlama. */
  private flash(x: number, y: number, z: number, size: number, hex: number, intensity: number, life = 0.16) {
    c1.setHex(hex).multiplyScalar(intensity);
    this.glow.emit({ x, y, z, life, size, endSize: size * 1.4, r: c1.r, g: c1.g, b: c1.b });
  }

  /** Yıldız ışıltıları (taş toplama, sandık, tapınak, seviye). */
  private stars(
    x: number,
    y: number,
    z: number,
    n: number,
    hex: number,
    intensity: number,
    spread: number,
    rise: number,
    size: number,
    life: number,
  ): void {
    c1.setHex(hex).multiplyScalar(intensity);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = spread * rnd(0.3, 1);
      this.glow.emit({
        x,
        y,
        z,
        vx: Math.cos(a) * s,
        vy: rise * rnd(0.5, 1),
        vz: Math.sin(a) * s,
        life: life * rnd(0.7, 1),
        size: size * rnd(0.7, 1.2),
        endSize: 0,
        r: c1.r,
        g: c1.g,
        b: c1.b,
        drag: 2,
        shape: SHAPE_STAR,
      });
    }
  }

  /** Toz/duman bulutu. */
  private puff(
    x: number,
    y: number,
    z: number,
    n: number,
    hex: number,
    alpha: number,
    size: number,
    life: number,
    spread: number,
    rise: number,
  ): void {
    c1.setHex(hex);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = spread * rnd(0.4, 1);
      const e: Emit = {
        x: x + Math.cos(a) * 0.15,
        y,
        z: z + Math.sin(a) * 0.15,
        vx: Math.cos(a) * s,
        vy: rise * rnd(0.6, 1.2),
        vz: Math.sin(a) * s,
        life: life * rnd(0.75, 1.15),
        size: size * rnd(0.7, 1),
        endSize: size * 2.2,
        r: c1.r,
        g: c1.g,
        b: c1.b,
        a: alpha,
        drag: 3,
      };
      this.dust.emit(e);
    }
  }

  /** Seken katı parçalar. */
  private shards(x: number, y: number, z: number, n: number, colors: readonly number[], size: number) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(2, 5);
      this.chunks.emit(
        x,
        y,
        z,
        Math.cos(a) * s,
        rnd(4, 8),
        Math.sin(a) * s,
        size * rnd(0.6, 1.3),
        colors[k % colors.length],
        rnd(0.9, 1.4),
        rnd(6, 14),
      );
    }
  }

  // ------------------------------------------------------------- sim olayları

  private drainEvents(world: World): void {
    let hits = 0;
    this.hitCursor = world.hitFx.drain(this.hitCursor, (d, o) => {
      if (hits++ >= MAX_HITS) return;
      const crit = d[o + 4] > 0;
      const y = d[o + 1] - 0.5;
      if (crit) {
        this.sparks(d[o], y, d[o + 2], 6, 0xffa23d, 3.2, 9, 0.2, 0.32);
        this.flash(d[o], y, d[o + 2], 0.9, 0xffd27a, 2.5, 0.1);
      } else {
        this.sparks(d[o], y, d[o + 2], 3, 0xfff0c0, 2.4, 7, 0.14, 0.24);
      }
    });

    let deaths = 0;
    this.deathCursor = world.deathFx.drain(this.deathCursor, (d, o) => {
      if (deaths++ >= MAX_DEATHS) return;
      const def = ENEMIES[d[o + 3]];
      const look = DEATH[def?.id ?? ''] ?? { colors: [0xffffff, 0xcccccc], n: 5, size: 0.2 };
      const s = d[o + 5];
      const [x, y, z] = [d[o], d[o + 1] + 0.6 * s, d[o + 2]];
      this.shards(x, y, z, look.n, look.colors, look.size * s);
      this.puff(x, d[o + 1] + 0.2, z, 3, 0xe8e4d8, 0.45, 0.6 * s, 0.6, 1.6, 0.8);
      if (look.spark) this.sparks(x, y, z, 6, look.spark, 3, 6, 0.16, 0.4);
    });

    this.blastCursor = world.blastFx.drain(this.blastCursor, (d, o) => {
      const r = Math.min(6, d[o + 3]);
      const [x, y, z] = [d[o], d[o + 1] + 0.5, d[o + 2]];
      this.flash(x, y + 0.3, z, r * 1.5, 0xffc070, 4, 0.22);
      this.sparks(x, y, z, Math.round(10 + r * 3), 0xff8a2a, 3.5, 6 + r * 2, 0.24, 0.6, 12);
      this.puff(x, y, z, Math.round(4 + r), 0x4a4038, 0.65, r * 0.45, 1.1, r * 0.9, 1.6);
      this.shards(x, y, z, 5, [0x7a5a3a, 0x5a4330], 0.22);
    });

    this.breakCursor = world.breakFx.drain(this.breakCursor, (d, o) => {
      const kind = d[o + 3];
      const [x, y, z] = [d[o], d[o + 1], d[o + 2]];
      if (kind === VASE) {
        this.shards(x, y + 0.6, z, 9, [0xc8743f, 0xa65a2e, 0xe0a070], 0.22);
        this.puff(x, y + 0.3, z, 4, 0xd9c8a8, 0.5, 0.5, 0.7, 1.8, 0.9);
      } else if (kind === CHEST) {
        // Patlama sandıktan çıkan en iyi eşyanın nadirliğiyle büyür ve renklenir.
        const rarity = d[o + 4];
        const color = CHEST_RARITY_COLOR[rarity] ?? 0xffd34a;
        for (let k = 0; k < 14 + rarity * 6; k++) {
          const a = Math.random() * Math.PI * 2;
          const s = rnd(1.5, 4);
          this.coins.emit(
            x,
            y + 0.8,
            z,
            Math.cos(a) * s,
            rnd(7, 11),
            Math.sin(a) * s,
            1,
            0xffffff,
            rnd(1.4, 2),
            rnd(8, 16),
          );
        }
        this.stars(
          x,
          y + 1,
          z,
          18 + rarity * 14,
          color,
          2.8,
          3 + rarity,
          4 + rarity,
          0.5,
          0.9 + rarity * 0.2,
        );
        this.flash(x, y + 1, z, 3 + rarity * 1.5, color, 3, 0.25 + rarity * 0.08);
        if (rarity >= 2) {
          // Epik/efsanevi: gökyüzüne yükselen ışık sütunu.
          for (let k = 0; k < 10 * rarity; k++) {
            this.stars(
              x + rnd(-0.4, 0.4),
              y + rnd(0.5, 1.5),
              z + rnd(-0.4, 0.4),
              1,
              color,
              3.5,
              0.3,
              9,
              0.6,
              1.4,
            );
          }
        }
      } else if (kind === SHRINE) {
        for (let k = 0; k < 40; k++) {
          const a = Math.random() * Math.PI * 2;
          const r = rnd(0.3, 1.2);
          c1.setHex(0x7fe3ff).multiplyScalar(2.8);
          this.glow.emit({
            x: x + Math.cos(a) * r,
            y: y + rnd(0, 1.5),
            z: z + Math.sin(a) * r,
            vx: -Math.sin(a) * 1.2,
            vy: rnd(3, 8),
            vz: Math.cos(a) * 1.2,
            life: rnd(0.9, 1.5),
            size: rnd(0.3, 0.55),
            endSize: 0,
            r: c1.r,
            g: c1.g,
            b: c1.b,
            drag: 0.6,
            shape: SHAPE_STAR,
          });
        }
        this.flash(x, y + 2, z, 4, 0x9feeff, 2.5, 0.3);
      } else if (kind === TORCH_FX) {
        this.sparks(x, y + 1.2, z, 22, 0xff7a20, 3.2, 6, 0.14, 1.1, 5);
        this.puff(x, y + 1.2, z, 4, 0x3a3634, 0.6, 0.5, 0.9, 1.2, 1.4);
        this.shards(x, y + 1, z, 5, [0x4a4a52, 0x6a5a48], 0.18);
      }
    });

    let collects = 0;
    this.collectCursor = world.collectFx.drain(this.collectCursor, (d, o) => {
      if (collects++ >= MAX_COLLECTS) return;
      const kind = d[o + 3];
      if (kind === COLLECT_GEM) {
        const tier = gemTier(d[o + 4]);
        this.stars(d[o], d[o + 1], d[o + 2], 2 + tier, GEM_TIERS[tier].color, 2.6, 1.8, 1.5, 0.45, 0.4);
      } else {
        const hex = PICKUP_SPARK[kind - 1] ?? 0xffffff;
        this.stars(d[o], d[o + 1], d[o + 2], kind - 1 === PICKUP_HEAL ? 8 : 4, hex, 2.6, 1.6, 2.2, 0.5, 0.6);
      }
    });
  }

  /** Seviye atlama: oyuncunun çevresinde yükselen altın sarmal + yerde altın halka. */
  private levelUp(world: World): void {
    if (world.level <= this.lastLevel) {
      this.lastLevel = world.level;
      return;
    }
    this.lastLevel = world.level;
    const p = world.player;
    c1.setHex(0xffcf4a).multiplyScalar(2.6);
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 6;
      const r = rnd(0.7, 1.1);
      this.glow.emit({
        x: p.x + Math.cos(a) * r,
        y: p.y + rnd(0, 0.6),
        z: p.z + Math.sin(a) * r,
        vx: -Math.sin(a) * 1.6,
        vy: rnd(3, 7),
        vz: Math.cos(a) * 1.6,
        life: rnd(0.8, 1.3),
        size: rnd(0.25, 0.45),
        endSize: 0,
        r: c1.r,
        g: c1.g,
        b: c1.b,
        drag: 0.8,
        shape: k % 3 === 0 ? SHAPE_STAR : SHAPE_DOT,
      });
    }
    this.flash(p.x, p.y + 1, p.z, 3.2, 0xffe6a0, 2.2, 0.3);
    this.pulses.spawn(p.x, p.y, p.z, 5, 0xffc94a);
  }

  /** Koşu, kayma, zıplama ve iniş tozu. */
  private heroDust(world: World, dt: number): void {
    const p = world.player;
    if (world.gameOver) return;
    const ground = world.terrain.heightAt(p.x, p.z);
    if (!p.grounded) {
      if (this.wasGrounded && p.vy > 0)
        this.puff(p.x, ground + 0.1, p.z, 5, 0xd8cfb0, 0.4, 0.35, 0.5, 1.6, 0.3);
      this.airborne += dt;
    } else if (!this.wasGrounded) {
      if (this.airborne > 0.25) this.puff(p.x, ground + 0.1, p.z, 10, 0xd8cfb0, 0.5, 0.45, 0.6, 3, 0.4);
      this.airborne = 0;
    }
    this.wasGrounded = p.grounded;
    if (!p.grounded) return;
    const speed = p.speed;
    if (speed < 4) return;
    this.dustTimer -= dt;
    if (this.dustTimer > 0) return;
    this.dustTimer = p.sliding ? 0.03 : 0.11;
    const back = 0.25 / speed;
    this.puff(
      p.x - p.vx * back,
      ground + 0.12,
      p.z - p.vz * back,
      p.sliding ? 2 : 1,
      0xd8cfb0,
      p.sliding ? 0.5 : 0.35,
      p.sliding ? 0.45 : 0.3,
      0.55,
      0.6,
      0.6,
    );
  }

  /** Meşale korları ve alev parıltısı. */
  private torches(world: World, dt: number, time: number): void {
    const t = world.torches;
    const p = world.player;
    this.emberTimer -= dt;
    const emit = this.emberTimer <= 0;
    if (emit) this.emberTimer = 0.16;
    c1.setHex(0xff8a2a).multiplyScalar(3);
    for (let i = 0; i < t.count; i++) {
      if ((t.x[i] - p.x) ** 2 + (t.z[i] - p.z) ** 2 > 70 * 70) continue;
      const y = world.terrain.heightAt(t.x[i], t.z[i]) + 1.4;
      const flicker = 1 + Math.sin(time * 13 + i * 7) * 0.12;
      this.halo(t.x[i], y, t.z[i], 2.6 * flicker, 0xff8a2a, 1);
      if (!emit) continue;
      this.glow.emit({
        x: t.x[i] + rnd(-0.25, 0.25),
        y: y + 0.2,
        z: t.z[i] + rnd(-0.25, 0.25),
        vx: rnd(-0.4, 0.4),
        vy: rnd(1.2, 2.4),
        vz: rnd(-0.4, 0.4),
        life: rnd(1.1, 1.8),
        size: rnd(0.08, 0.13),
        endSize: 0.02,
        r: c1.r,
        g: c1.g,
        b: c1.b,
        gravity: -0.4,
        drag: 0.3,
      });
    }
  }

  /** Büyü oku izi ve parıltısı; XP taşı parıltısı. */
  private projectiles(world: World): void {
    const pr = world.projectiles;
    const tint = world.tintOf('homingBolt') || 0xaee9ff;
    c1.setHex(tint).multiplyScalar(1.6);
    const [r, g, b] = [c1.r, c1.g, c1.b];
    let trails = 0;
    for (let i = 0; i < pr.count; i++) {
      if (pr.dead[i] || pr.kind[i] !== PROJ_BOLT) continue;
      const s = pr.radius[i];
      this.halo(pr.x[i], pr.y[i], pr.z[i], s * 4.5, tint, 1);
      if (trails++ < MAX_TRAILS) {
        this.glow.emit({
          x: pr.x[i],
          y: pr.y[i],
          z: pr.z[i],
          life: 0.22,
          size: s * 2.4,
          endSize: 0,
          r,
          g,
          b,
        });
      }
    }
    const gm = world.gems;
    for (let i = 0; i < gm.count; i++) {
      if (gm.dead[i]) continue;
      const tier = GEM_TIERS[gemTier(gm.value[i])];
      this.halo(gm.x[i], gm.y[i], gm.z[i], 1.2 * tier.scale, tier.color, 0.9);
    }
  }

  /** Yerdeki pickup'ların hafif parıltısı. */
  private pickupHalos(world: World, time: number): void {
    const pk = world.pickups;
    for (let i = 0; i < pk.count; i++) {
      if (pk.dead[i]) continue;
      const hex = PICKUP_SPARK[pk.kind[i]];
      if (hex === undefined) continue;
      const gold = pk.kind[i] === PICKUP_GOLD;
      const pulse = 1 + Math.sin(time * 4 + i) * 0.1;
      this.halo(pk.x[i], pk.y[i], pk.z[i], (gold ? 0.9 : 1.8) * pulse, hex, gold ? 0.6 : 1);
    }
  }

  /** Canlı parçacık sayısı (hata ayıklama). */
  get liveCount(): number {
    return this.glow.count + this.dust.count;
  }
}
