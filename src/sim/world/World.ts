import { Rng } from '../../core/Rng';
import { BALANCE, xpToNext } from '../../data/balance';
import { ARCHER, ELITE, ENEMIES, EXPLODER } from '../../data/enemies';
import { ITEM_FX, ITEM_INDEX, ITEMS } from '../../data/items';
import { SHRINE, SHRINE_BONUSES } from '../../data/shrines';
import { TOMES, tomeValue } from '../../data/tomes';
import { TORCH, TORCH_DROPS, type TorchDrop, torchDropWeights } from '../../data/torches';
import { WEAPON_INDEX, WEAPONS } from '../../data/weapons';
import { Blasts } from '../combat/Blasts';
import { PF_GROUND_FOLLOW, PF_RETURNING, PF_RETURNS, ProjectilePool } from '../combat/ProjectilePool';
import { EnemyPool } from '../enemies/EnemyPool';
import { SpawnDirector } from '../enemies/SpawnDirector';
import { GemPool } from '../pickups/GemPool';
import {
  PICKUP_BAG,
  PICKUP_CLOCK,
  PICKUP_GOLD,
  PICKUP_HEAL,
  PICKUP_MAGNET,
  PICKUP_ROSARY,
  PickupPool,
} from '../pickups/PickupPool';
import { Player, type PlayerInput } from '../player/Player';
import { type Rarity, rarityMult, rollRarity } from '../progression/Rarity';
import { rollUpgrades, type UpgradeOption, upgradeKey } from '../progression/Upgrades';
import { SpatialGrid } from '../spatial/SpatialGrid';
import { Stats } from '../stats/Stats';
import { Heightmap } from '../terrain/Heightmap';
import { createWeapon, levelUpWeapon, updateWeapon, type WeaponInstance } from '../weapons/Weapons';
import { EventRing } from './EventRing';
import { CHEST, Interactables, SHRINE as SHRINE_KIND, VASE } from './Interactables';
import { Obstacles } from './Obstacles';
import { TORCH_FX, Torches } from './Torches';

export interface WorldOptions {
  seed: number;
  /** Aynı anda en fazla kaç düşman (masaüstü/mobil farklı). */
  enemyCap?: number;
  godMode?: boolean;
  startWeapon?: string;
}

export interface ShrineOption {
  bonus: number;
  rarity: Rarity;
  value: number;
}

export type Reward =
  | { kind: 'item'; item: number; rarity: Rarity }
  | { kind: 'shrine'; options: ShrineOption[] };

export interface ProjectileSpawn {
  kind: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  damage: number;
  radius: number;
  pierce: number;
  knockback: number;
  homing?: number;
  flags?: number;
}

const PB = BALANCE.player;
const XB = BALANCE.xp;

/** pulseFx türleri: yayılan halka efektinin rengi. */
export const PULSE_MAGNET = 0;
export const PULSE_FREEZE = 1;
export const PULSE_HOLY = 2;
export const PULSE_PHOENIX = 3;

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
  /** Düşman mermileri (Okçu); sadece oyuncuya çarpar. */
  readonly enemyShots = new ProjectilePool(256);
  readonly gems = new GemPool(XB.gemCapacity);
  readonly pickups = new PickupPool(BALANCE.loot.pickupCapacity);
  readonly interactables = new Interactables(256);
  readonly torches = new Torches(TORCH.capacity);
  /** Eşya başına sahip olunan kopya sayısı (ITEMS sırasıyla). */
  readonly itemCounts: number[] = ITEMS.map(() => 0);
  readonly enemyGrid: SpatialGrid;
  readonly director: SpawnDirector;
  readonly weapons: WeaponInstance[] = [];
  readonly tomeLevels: number[] = TOMES.map(() => 0);

  /** Render/ses için olay akışları. death: x,y,z,type · hit: x,y,z,hasar,kritik */
  readonly deathFx = new EventRing(256, 4);
  readonly hitFx = new EventRing(512, 5);
  /** Kılıç savuruşu: x,y,z,açı,menzil */
  readonly arcFx = new EventRing(32, 5);
  /** Şimşek: x1,y1,z1,x2,y2,z2 */
  readonly beamFx = new EventRing(128, 6);
  /** Patlama: x,y,z,yarıçap */
  readonly blastFx = new EventRing(64, 4);
  /** Kırılma/açılma: x,y,z,tür (Interactables türü) */
  readonly breakFx = new EventRing(32, 4);
  /** Yayılan halka (mıknatıs, donma, kutsal, diriliş): x,y,z,yarıçap,tür (PULSE_*) */
  readonly pulseFx = new EventRing(16, 5);
  readonly blasts = new Blasts(48);

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
  eliteKills = 0;
  chestPrice: number = BALANCE.loot.chestBasePrice;
  chestsOpened = 0;
  /** Sandık/tapınak ödülü: doluysa oyun durur, oyuncu alır. */
  reward: Reward | null = null;
  /** Kalkan Muskası bekleme süresi. */
  shieldCooldown = 0;
  /** Mıknatıs Taşı'nın bir sonraki çekişine kalan süre. */
  lodestoneTimer = 0;
  /** Son Anka Tüyü dirilişinin zamanı (HUD duyurusu için; −1 = hiç). */
  revivedAt = -1;
  /** Son Tespih'in zamanı (ekran beyaz flaşı için; −1 = hiç). */
  holyAt = -1;
  /** Bir sonraki meşale denemesine kalan süre. */
  torchTimer: number = TORCH.firstDelay;
  gold = 0;

  /** Run başına seviye atlama hakları. */
  rerolls = 2;
  banishes = 1;
  skips = 1;
  /** Yasaklanan silah/kitap anahtarları (upgradeKey). */
  readonly banished = new Set<string>();

  private readonly buf = new Int32Array(4096);
  private readonly topDist = new Float32Array(16);
  private readonly tmp2 = new Float32Array(2);
  private readonly tmp3 = new Float32Array(3);

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
    this.interactables.populate(mapRng, this.terrain, this.obstacles, 12, 8, 22);

    this.stats = new Stats({
      maxHp: PB.baseHp,
      regen: PB.baseRegen,
      moveSpeed: PB.baseMoveSpeed,
      pickupRange: PB.pickupRange,
    });
    this.enemies = new EnemyPool(Math.max(1200, this.enemyCap));
    this.enemyGrid = new SpatialGrid(A.size, 4, this.enemies.capacity);
    this.director = new SpawnDirector(this.rng);

    this.player.y = this.terrain.heightAt(0, 0);
    this.player.maxHp = this.player.hp = this.stats.get('maxHp');
    this.weapons.push(createWeapon(WEAPONS[WEAPON_INDEX[opts.startWeapon ?? 'magicBolt']]));
  }

  get paused(): boolean {
    return this.gameOver || this.offer !== null || this.reward !== null;
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
    this.updateBlasts(dt);
    this.updateEnemies(dt);
    this.updateEnemyShots(dt);
    this.updateGems(dt);
    this.updatePickups(dt);
    this.updateInteractables(dt);
    this.updateTorches(dt);
    this.director.update(this, dt);

    e.removeDead();
    this.projectiles.removeDead();
    this.enemyShots.removeDead();
    this.gems.removeDead();
    this.pickups.removeDead();
    this.shieldCooldown = Math.max(0, this.shieldCooldown - dt);
    this.updateLodestone(dt);

    p.maxHp = this.stats.get('maxHp');
    p.hp = Math.min(p.maxHp, p.hp + this.stats.get('regen') * dt);
    if (p.hp <= 0) {
      if (this.godMode) p.hp = p.maxHp;
      else if (this.itemCounts[ITEM_INDEX.phoenix] > 0) this.revive();
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
    this.resolveLevelUp();
  }

  /** Kartları yeniden çeker (hak harcar). */
  reroll(): boolean {
    if (!this.offer || this.rerolls <= 0) return false;
    this.rerolls--;
    this.offer = rollUpgrades(this, this.rng);
    return true;
  }

  /** Kartı yasaklar: o silah/kitap bu run boyunca bir daha çıkmaz; yerine yeni kart gelir. */
  banish(index: number): boolean {
    const opt = this.offer?.[index];
    if (!this.offer || !opt || opt.kind === 'heal' || this.banishes <= 0) return false;
    this.banishes--;
    this.banished.add(upgradeKey(opt));
    const others = new Set(this.offer.filter((_, i) => i !== index).map(upgradeKey));
    const [replacement] = rollUpgrades(this, this.rng, 1, others);
    if (replacement) this.offer[index] = replacement;
    else this.offer.splice(index, 1);
    return true;
  }

  /** Seviye atlamayı geçer; karşılığında az miktar altın. */
  skip(): boolean {
    if (!this.offer || this.skips <= 0) return false;
    this.skips--;
    this.gold += 5;
    this.resolveLevelUp();
    return true;
  }

  private resolveLevelUp(): void {
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
        if (w) levelUpWeapon(w, rarityMult(opt.rarity));
        break;
      }
      case 'tome': {
        const d = TOMES[opt.tome];
        const v = tomeValue(d, rarityMult(opt.rarity));
        this.tomeLevels[opt.tome]++;
        if (d.mode === 'mult') this.stats.addMult(d.stat, v);
        else this.stats.addFlat(d.stat, v);
        if (d.stat === 'maxHp') {
          p.maxHp = this.stats.get('maxHp');
          p.hp = Math.min(p.maxHp, p.hp + v);
        }
        break;
      }
      case 'heal':
        p.hp = Math.min(p.maxHp, p.hp + opt.amount);
        break;
    }
  }

  /** Ödülü al: sandık eşyası ya da tapınak bonusu (choice = seçilen seçenek). */
  takeReward(choice = 0): void {
    const r = this.reward;
    if (!r) return;
    if (r.kind === 'item') this.applyItem(r.item);
    else {
      const o = r.options[Math.min(choice, r.options.length - 1)];
      const def = SHRINE_BONUSES[o.bonus];
      if (def.mode === 'mult') this.stats.addMult(def.stat, o.value);
      else this.stats.addFlat(def.stat, o.value);
      if (def.stat === 'maxHp') {
        this.player.maxHp = this.stats.get('maxHp');
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + o.value);
      }
    }
    this.reward = null;
  }

  /** Tapınak için tekrarsız, nadirlik zarlı bonus seçenekleri. */
  rollShrineOptions(): ShrineOption[] {
    const luck = this.stats.get('luck');
    const weights = SHRINE_BONUSES.map(() => 1);
    const out: ShrineOption[] = [];
    for (let k = 0; k < SHRINE.choices; k++) {
      const bonus = this.rng.weightedIndex(weights);
      if (bonus < 0) break;
      weights[bonus] = 0;
      const rarity = rollRarity(this.rng, luck);
      out.push({ bonus, rarity, value: SHRINE_BONUSES[bonus].value * rarityMult(rarity) });
    }
    return out;
  }

  applyItem(index: number): void {
    const def = ITEMS[index];
    this.itemCounts[index]++;
    for (const s of def.stats ?? []) {
      if (s.mode === 'mult') this.stats.addMult(s.stat, s.value);
      else this.stats.addFlat(s.stat, s.value);
    }
    this.player.maxHp = this.stats.get('maxHp');
  }

  /** Nadirlik zarına göre eşya seçer; o kademede eşya yoksa bir alt kademeye iner. */
  rollItem(): { item: number; rarity: Rarity } {
    let rarity = rollRarity(this.rng, this.stats.get('luck'));
    for (;;) {
      const pool = ITEMS.map((d, i) => (d.rarity === rarity ? i : -1)).filter((i) => i >= 0);
      if (pool.length > 0 || rarity === 0) return { item: this.rng.pick(pool), rarity };
      rarity = (rarity - 1) as Rarity;
    }
  }

  /** Mıknatıs Taşı: belirli aralıklarla yakındaki XP ve altını çeker. */
  private updateLodestone(dt: number): void {
    const n = this.itemCounts[ITEM_INDEX.lodestone];
    if (n <= 0) return;
    this.lodestoneTimer -= dt;
    if (this.lodestoneTimer > 0) return;
    this.lodestoneTimer = Math.max(
      ITEM_FX.lodestoneMin,
      ITEM_FX.lodestoneCooldown - ITEM_FX.lodestonePerCopy * (n - 1),
    );
    const p = this.player;
    this.attract(ITEM_FX.lodestoneRadius);
    this.pulseFx.push(p.x, p.y, p.z, ITEM_FX.lodestoneRadius, PULSE_MAGNET);
  }

  /** Anka Tüyü: bir kopya harcanır, yarım canla dirilir, kısa dokunulmazlık ve alev patlaması. */
  private revive(): void {
    const p = this.player;
    this.itemCounts[ITEM_INDEX.phoenix]--;
    p.hp = p.maxHp * ITEM_FX.phoenixHp;
    p.invuln = ITEM_FX.phoenixInvuln;
    this.revivedAt = this.time;
    this.addBlast(p.x, p.z, ITEM_FX.phoenixRadius, ITEM_FX.phoenixDamage, 12, 0);
    this.pulseFx.push(p.x, p.y, p.z, ITEM_FX.phoenixRadius * 1.6, PULSE_PHOENIX);
  }

  /** Düşmanı `seconds` boyunca dondurur (süre uzatılmaz, en uzunu geçerli). */
  freezeEnemy(i: number, seconds: number): void {
    const e = this.enemies;
    if (!e.dead[i]) e.frozen[i] = Math.max(e.frozen[i], seconds);
  }

  /**
   * Oyuncuya hasar: dokunulmazsa ya da Kalkan Muskası hazırsa vuruşu yutar. Verilen gerçek hasarı döner.
   */
  hurtPlayer(amount: number): number {
    if (this.player.invuln > 0) return 0;
    const amulets = this.itemCounts[ITEM_INDEX.amulet];
    if (amulets > 0 && this.shieldCooldown <= 0) {
      this.shieldCooldown = Math.max(
        ITEM_FX.amuletMin,
        ITEM_FX.amuletCooldown - ITEM_FX.amuletPerCopy * (amulets - 1),
      );
      return 0;
    }
    return this.player.takeDamage(amount, this.stats.get('armor'));
  }

  dropPickup(kind: number, x: number, y: number, z: number, value: number): void {
    // Küçük saçılma: aynı yere düşen paralar üst üste binmesin.
    const a = this.rng.range(0, Math.PI * 2);
    const r = this.rng.range(0.2, 0.9);
    this.pickups.add(kind, x + Math.sin(a) * r, y, z + Math.cos(a) * r, value);
  }

  private updatePickups(dt: number): void {
    const g = this.pickups;
    const p = this.player;
    const range = this.stats.get('pickupRange');
    const ty = p.y + 0.8;
    const collect2 = XB.collectRadius * XB.collectRadius;
    for (let i = 0; i < g.count; i++) {
      if (g.dead[i]) continue;
      const dx = p.x - g.x[i];
      const dy = ty - g.y[i];
      const dz = p.z - g.z[i];
      if (g.pull[i] === 0) {
        if (dx * dx + dz * dz < range * range) g.pull[i] = XB.magnetBaseSpeed;
        else continue;
      }
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < collect2) {
        g.dead[i] = 1;
        this.collectPickup(g.kind[i], g.value[i]);
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

  private collectPickup(kind: number, value: number): void {
    const p = this.player;
    switch (kind) {
      case PICKUP_GOLD:
      case PICKUP_BAG:
        this.gold += value * this.stats.get('goldGain');
        break;
      case PICKUP_HEAL:
        p.hp = Math.min(p.maxHp, p.hp + BALANCE.loot.healAmount);
        break;
      case PICKUP_MAGNET:
        this.attract();
        break;
      case PICKUP_CLOCK:
        this.freezeAround(TORCH.clockRadius, TORCH.clockTime);
        break;
      case PICKUP_ROSARY:
        this.smite(TORCH.rosaryRadius);
        break;
    }
  }

  /** Saat: oyuncunun çevresindeki tüm düşmanları dondurur. */
  freezeAround(radius: number, seconds: number): void {
    const e = this.enemies;
    const p = this.player;
    for (let i = 0; i < e.count; i++) {
      if ((e.x[i] - p.x) ** 2 + (e.z[i] - p.z) ** 2 <= radius * radius) this.freezeEnemy(i, seconds);
    }
    this.pulseFx.push(p.x, p.y, p.z, radius, PULSE_FREEZE);
  }

  /** Tespih: çevredeki elit olmayanlar ölür (XP düşer), elitler canlarının bir kısmını kaybeder. */
  smite(radius: number): void {
    const e = this.enemies;
    const p = this.player;
    for (let i = 0; i < e.count; i++) {
      if (e.dead[i] || (e.x[i] - p.x) ** 2 + (e.z[i] - p.z) ** 2 > radius * radius) continue;
      if (!e.elite[i]) {
        this.killEnemy(i);
        continue;
      }
      const dmg = e.maxHp[i] * TORCH.rosaryEliteFrac;
      e.hp[i] -= dmg;
      e.flash[i] = 0.12;
      this.damageDealt += dmg;
      this.hitFx.push(e.x[i], e.y[i] + e.hover[i] + 1, e.z[i], dmg, 1);
      if (e.hp[i] <= 0) this.killEnemy(i);
    }
    this.holyAt = this.time;
    this.pulseFx.push(p.x, p.y, p.z, radius, PULSE_HOLY);
  }

  /**
   * Oyuncuya `radius` içindeki XP taşlarını ve altınları çeker (mıknatıs). Varsayılan: tüm harita.
   * Can ve diğer özel pickup'lar çekilmez; oyuncu onları bilerek almalı.
   */
  attract(radius = Number.POSITIVE_INFINITY): void {
    const p = this.player;
    const r2 = radius * radius;
    const gm = this.gems;
    for (let j = 0; j < gm.count; j++) {
      if (gm.pull[j] === 0 && (gm.x[j] - p.x) ** 2 + (gm.z[j] - p.z) ** 2 <= r2)
        gm.pull[j] = XB.magnetBaseSpeed;
    }
    const pk = this.pickups;
    for (let j = 0; j < pk.count; j++) {
      if (pk.pull[j] !== 0 || (pk.kind[j] !== PICKUP_GOLD && pk.kind[j] !== PICKUP_BAG)) continue;
      if ((pk.x[j] - p.x) ** 2 + (pk.z[j] - p.z) ** 2 <= r2) pk.pull[j] = XB.magnetBaseSpeed;
    }
  }

  /** Vazolara çarpınca kırılır; sandığa yürüyünce altın yetiyorsa açılır. */
  private updateInteractables(dt: number): void {
    const it = this.interactables;
    const p = this.player;
    const L = BALANCE.loot;
    for (let i = 0; i < it.count; i++) {
      if (it.used[i]) continue;
      const d2 = (it.x[i] - p.x) ** 2 + (it.z[i] - p.z) ** 2;
      const y = this.terrain.heightAt(it.x[i], it.z[i]);
      // Çok yukarıdan (zıplarken) etkileşim yok; ama tapınağın boşalması yine işlemeli.
      const level = Math.abs(p.y - y) <= 2;
      if (it.kind[i] === VASE && level && d2 < L.vaseRadius * L.vaseRadius) {
        it.used[i] = 1;
        this.breakFx.push(it.x[i], y, it.z[i], VASE);
        const coins = this.rng.int(L.vaseGoldMin, L.vaseGoldMax);
        for (let c = 0; c < coins; c++) this.dropPickup(PICKUP_GOLD, it.x[i], y + 0.35, it.z[i], 1);
        if (this.rng.chance(L.vaseHealChance)) this.dropPickup(PICKUP_HEAL, it.x[i], y + 0.4, it.z[i], 1);
        if (this.rng.chance(L.vaseMagnetChance)) this.dropPickup(PICKUP_MAGNET, it.x[i], y + 0.4, it.z[i], 1);
      } else if (it.kind[i] === CHEST && level && d2 < L.chestRadius * L.chestRadius && !this.reward) {
        const free = it.free[i] === 1;
        if (!free && this.gold < this.chestPrice) continue;
        if (!free) {
          this.gold -= this.chestPrice;
          this.chestPrice = Math.round(this.chestPrice * L.chestPriceGrowth);
        }
        it.used[i] = 1;
        this.chestsOpened++;
        this.breakFx.push(it.x[i], y, it.z[i], CHEST);
        const { item, rarity } = this.rollItem();
        this.reward = { kind: 'item', item, rarity };
      } else if (it.kind[i] === SHRINE_KIND) {
        // İçinde durdukça dolar, çıkınca yavaşça boşalır.
        if (level && d2 < SHRINE.radius * SHRINE.radius) {
          it.charge[i] += dt / SHRINE.chargeTime;
          if (it.charge[i] >= 1 && !this.reward) {
            it.charge[i] = 1;
            it.used[i] = 1;
            this.breakFx.push(it.x[i], y, it.z[i], SHRINE_KIND);
            this.reward = { kind: 'shrine', options: this.rollShrineOptions() };
          }
        } else if (it.charge[i] > 0) {
          it.charge[i] = Math.max(0, it.charge[i] - (dt * SHRINE.decayRate) / SHRINE.chargeTime);
        }
      }
    }
  }

  /** HUD ipucu için: içinde durulan tapınağın dolumu (yoksa null). */
  nearbyShrine(): number | null {
    const it = this.interactables;
    const p = this.player;
    for (let i = 0; i < it.count; i++) {
      if (it.used[i] || it.kind[i] !== SHRINE_KIND) continue;
      if ((it.x[i] - p.x) ** 2 + (it.z[i] - p.z) ** 2 <= (SHRINE.radius + 2) ** 2) return it.charge[i];
    }
    return null;
  }

  /** HUD ipucu için: 4 m içindeki kapalı sandık (yoksa null). */
  nearbyChest(): { price: number; free: boolean; affordable: boolean } | null {
    const it = this.interactables;
    const p = this.player;
    for (let i = 0; i < it.count; i++) {
      if (it.used[i] || it.kind[i] !== CHEST) continue;
      if ((it.x[i] - p.x) ** 2 + (it.z[i] - p.z) ** 2 > 16) continue;
      const free = it.free[i] === 1;
      return { price: this.chestPrice, free, affordable: free || this.gold >= this.chestPrice };
    }
    return null;
  }

  addXp(amount: number): void {
    this.xp += amount * this.stats.get('xpGain');
    const bandages = this.itemCounts[ITEM_INDEX.bandage];
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpToNext(this.level);
      this.pendingLevelUps++;
      if (bandages > 0) {
        const p = this.player;
        p.hp = Math.min(p.maxHp, p.hp + ITEM_FX.bandageHeal * bandages);
      }
    }
  }

  // ---------------------------------------------------------------- Düşmanlar

  spawnEnemy(type: number, x: number, z: number, elite = false): number {
    const d = ENEMIES[type];
    const e = this.enemies;
    const i = e.add(type);
    if (i < 0) return -1;
    const hpMul = this.director.hpMultiplier(this.time) * (elite ? ELITE.hp : 1);
    const scale = elite ? ELITE.scale : 1;
    e.x[i] = x;
    e.z[i] = z;
    e.y[i] = this.terrain.heightAt(x, z);
    e.hp[i] = e.maxHp[i] = d.hp * hpMul;
    e.damage[i] = d.damage * this.director.damageMultiplier(this.time) * (elite ? ELITE.damage : 1);
    e.speed[i] = d.speed * this.rng.range(0.88, 1.12) * (elite ? ELITE.speed : 1);
    e.radius[i] = d.radius * scale;
    e.hover[i] = d.hover;
    e.knockResist[i] = elite ? Math.min(0.9, d.knockbackResist + 0.5) : d.knockbackResist;
    e.xp[i] = d.xp * (elite ? ELITE.xp : 1) * (1 + XB.xpPerMinute * (this.time / 60));
    e.scale[i] = scale;
    e.elite[i] = elite ? 1 : 0;
    e.phase[i] = this.rng.range(0, Math.PI * 2);
    e.timer[i] =
      d.behavior === 'ranged' ? this.rng.range(1, ARCHER.cooldown) : d.behavior === 'exploder' ? -1 : 0;
    return i;
  }

  private updateEnemies(dt: number): void {
    const e = this.enemies;
    const p = this.player;
    const buf = this.buf;
    const tmp = this.tmp2;
    const knockDecay = Math.exp(-7 * dt);
    const pr = PB.radius;

    for (let i = 0; i < e.count; i++) {
      if (e.dead[i]) continue;
      e.contactCd[i] -= dt;
      if (e.flash[i] > 0) e.flash[i] -= dt;
      const frozen = e.frozen[i] > 0;
      if (frozen) e.frozen[i] = Math.max(0, e.frozen[i] - dt);

      const x = e.x[i];
      const z = e.z[i];
      const dx = p.x - x;
      const dz = p.z - z;
      const dist = Math.hypot(dx, dz) || 1e-4;
      let sp = e.speed[i];
      let ux = dx / dist;
      let uz = dz / dist;

      // Donmuş düşman yerinde durur, ateş etmez, fitili ilerlemez.
      if (frozen) sp = 0;
      else
        switch (ENEMIES[e.type[i]].behavior) {
          case 'ranged': {
            // Mesafe koru: uzaksa yaklaş, yakınsa geri çekil, aradaysa yana kay.
            if (dist < ARCHER.minRange) {
              ux = -ux;
              uz = -uz;
              sp *= 0.8;
            } else if (dist <= ARCHER.maxRange) {
              const side = e.uid[i] & 1 ? 1 : -1;
              const tx = uz * side;
              uz = -ux * side;
              ux = tx;
              sp *= 0.35;
            }
            e.timer[i] -= dt;
            if (e.timer[i] <= 0 && dist < ARCHER.fireRange) {
              this.fireEnemyShot(i);
              e.timer[i] = ARCHER.cooldown * this.rng.range(0.85, 1.15);
            }
            break;
          }
          case 'exploder': {
            if (e.timer[i] >= 0) {
              e.timer[i] -= dt;
              sp *= 0.25;
              if (e.timer[i] <= 0) {
                this.explode(i);
                continue;
              }
            } else if (dist < EXPLODER.triggerRange) {
              e.timer[i] = EXPLODER.fuse;
            }
            break;
          }
          case 'chase':
            break;
        }
      const vx = ux * sp;
      const vz = uz * sp;
      // Donukken son yönü koru (render yüz yönü için).
      if (!frozen) {
        e.vx[i] = vx;
        e.vz[i] = vz;
      }

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
        if (e.contactCd[i] <= 0) this.contact(i, cx / d, cz / d, frozen);
      }
    }
    p.x = this.terrain.clampToPlayable(p.x);
    p.z = this.terrain.clampToPlayable(p.z);
  }

  /** Düşman oyuncuya değdi (bekleme süresi bitmişken). (ux,uz): düşmandan oyuncuya birim yön. */
  private contact(i: number, ux: number, uz: number, frozen: boolean): void {
    const e = this.enemies;
    const rocket = this.itemCounts[ITEM_INDEX.rocket];
    if (rocket > 0 && this.player.sliding) {
      // Roket Çizme: kayarken çarpılan düşman hasar alır ve savrulur, oyuncu hasar almaz.
      e.contactCd[i] = PB.contactCooldown;
      const kb = ITEM_FX.rocketKnockback;
      this.damageEnemy(i, ITEM_FX.rocketDamage * rocket, -ux * kb, -uz * kb);
      return;
    }
    if (frozen) return;
    e.contactCd[i] = PB.contactCooldown;
    const dealt = this.hurtPlayer(e.damage[i]);
    const thorns = this.itemCounts[ITEM_INDEX.thorns];
    if (thorns > 0 && dealt > 0) {
      this.damageEnemy(i, (dealt * ITEM_FX.thornsMult * thorns) / this.stats.get('damage'), -ux, -uz);
    }
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
    if (e.hp[i] <= 0) {
      this.killEnemy(i);
      return;
    }
    const frost = this.itemCounts[ITEM_INDEX.frost];
    if (frost > 0 && this.rng.chance(Math.min(ITEM_FX.frostMaxChance, ITEM_FX.frostChance * frost))) {
      this.freezeEnemy(i, ITEM_FX.frostTime);
    }
  }

  killEnemy(i: number): void {
    const e = this.enemies;
    e.dead[i] = 1;
    this.kills++;
    const x = e.x[i];
    const z = e.z[i];
    const gy = this.terrain.heightAt(x, z) + 0.35;
    this.gems.add(x, gy, z, e.xp[i], this.player.x, this.player.z);
    if (e.elite[i]) {
      // Elit: ücretsiz ödül sandığı + biraz altın.
      this.eliteKills++;
      this.interactables.add(CHEST, x, z, this.rng.range(0, Math.PI * 2), true);
      for (let c = 0; c < 3; c++) this.dropPickup(PICKUP_GOLD, x, gy, z, 2);
      if (this.rng.chance(BALANCE.loot.eliteMagnetChance)) this.dropPickup(PICKUP_MAGNET, x, gy + 0.1, z, 1);
    } else if (this.rng.chance(BALANCE.loot.goldDropChance)) {
      this.dropPickup(PICKUP_GOLD, x, gy, z, 1);
    }
    const fang = this.itemCounts[ITEM_INDEX.fang];
    if (fang > 0 && this.rng.chance(ITEM_FX.fangChance * fang)) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + ITEM_FX.fangHeal);
    }
    const skull = this.itemCounts[ITEM_INDEX.skull];
    if (skull > 0 && this.rng.chance(ITEM_FX.skullChance * skull)) {
      // Patlamayı kuyruğa al (zincirleme patlamalar özyineleme yapmasın).
      this.addBlast(x, z, ITEM_FX.skullRadius, ITEM_FX.skullDamage, 3, 0.05);
    }
    this.deathFx.push(e.x[i], e.y[i] + e.hover[i], e.z[i], e.type[i]);
  }

  /** Patlayan düşmanın fitili bitti: oyuncu yakındaysa hasar alır. XP ve kill sayılmaz. */
  private explode(i: number): void {
    const e = this.enemies;
    const p = this.player;
    e.dead[i] = 1;
    this.blastFx.push(e.x[i], e.y[i], e.z[i], EXPLODER.radius);
    const d = Math.hypot(p.x - e.x[i], p.z - e.z[i]);
    if (d < EXPLODER.radius + PB.radius && Math.abs(p.y - e.y[i]) < 2.5) this.hurtPlayer(e.damage[i]);
  }

  private fireEnemyShot(i: number): void {
    const e = this.enemies;
    const p = this.player;
    const s = this.enemyShots;
    const j = s.add();
    if (j < 0) return;
    const ox = e.x[i];
    const oy = e.y[i] + e.hover[i] + 1.2 * e.scale[i];
    const oz = e.z[i];
    const dx = p.x - ox;
    const dy = p.y + 1 - oy;
    const dz = p.z - oz;
    const len = Math.hypot(dx, dy, dz) || 1;
    s.x[j] = ox;
    s.y[j] = oy;
    s.z[j] = oz;
    s.vx[j] = (dx / len) * ARCHER.shotSpeed;
    s.vy[j] = (dy / len) * ARCHER.shotSpeed;
    s.vz[j] = (dz / len) * ARCHER.shotSpeed;
    s.life[j] = s.maxLife[j] = 2.5;
    s.radius[j] = 0.3;
    s.damage[j] =
      ARCHER.shotDamage * this.director.damageMultiplier(this.time) * (e.elite[i] ? ELITE.damage : 1);
  }

  private updateEnemyShots(dt: number): void {
    const s = this.enemyShots;
    const p = this.player;
    for (let j = 0; j < s.count; j++) {
      if (s.dead[j]) continue;
      s.life[j] -= dt;
      s.x[j] += s.vx[j] * dt;
      s.y[j] += s.vy[j] * dt;
      s.z[j] += s.vz[j] * dt;
      if (s.life[j] <= 0 || s.y[j] < this.terrain.heightAt(s.x[j], s.z[j]) - 0.2) {
        s.dead[j] = 1;
        continue;
      }
      const hr = s.radius[j] + PB.radius;
      if (
        (s.x[j] - p.x) ** 2 + (s.z[j] - p.z) ** 2 < hr * hr &&
        s.y[j] > p.y - 0.2 &&
        s.y[j] < p.y + PB.height
      ) {
        this.hurtPlayer(s.damage[j]);
        s.dead[j] = 1;
      }
    }
  }

  /** Bir küre içindeki tüm düşmanlara hasar (aura, patlama). */
  damageInRadius(x: number, y: number, z: number, r: number, base: number, knock: number): void {
    if (this.torches.count > 0) this.hitTorches(x, z, r);
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

  spawnProjectile(o: ProjectileSpawn): void {
    const pr = this.projectiles;
    const i = pr.add();
    if (i < 0) return;
    pr.kind[i] = o.kind;
    pr.x[i] = o.x;
    pr.y[i] = o.y;
    pr.z[i] = o.z;
    pr.vx[i] = o.vx;
    pr.vy[i] = o.vy;
    pr.vz[i] = o.vz;
    pr.life[i] = pr.maxLife[i] = o.life;
    pr.damage[i] = o.damage;
    pr.radius[i] = o.radius;
    pr.pierceLeft[i] = Math.min(255, Math.max(1, o.pierce));
    pr.knockback[i] = o.knockback;
    pr.homing[i] = o.homing ?? 0;
    pr.flags[i] = o.flags ?? 0;
  }

  /** Gecikmeli patlama (Havan). */
  addBlast(x: number, z: number, radius: number, damage: number, knockback: number, delay: number): void {
    this.blasts.add(x, z, radius, damage, knockback, delay);
  }

  private updateBlasts(dt: number): void {
    const b = this.blasts;
    for (let i = b.count - 1; i >= 0; i--) {
      b.timer[i] -= dt;
      if (b.timer[i] > 0) continue;
      const y = this.terrain.heightAt(b.x[i], b.z[i]);
      this.damageInRadius(b.x[i], y + 0.5, b.z[i], b.radius[i], b.damage[i], b.knockback[i]);
      this.blastFx.push(b.x[i], y, b.z[i], b.radius[i]);
      b.removeAt(i);
    }
  }

  /** (x,z) çevresindeki r yarıçapta canlı düşman sayısı. */
  countEnemiesNear(x: number, z: number, r: number): number {
    const e = this.enemies;
    const n = this.enemyGrid.query(x, z, r, this.buf);
    let c = 0;
    for (let k = 0; k < n; k++) {
      const j = this.buf[k];
      if (j >= e.count || e.dead[j]) continue;
      if ((e.x[j] - x) ** 2 + (e.z[j] - z) ** 2 <= r * r) c++;
    }
    return c;
  }

  /**
   * Yön (dirX, dirZ) etrafında yarım açısının kosinüsü cosHalf olan dilimdeki düşmanlara hasar
   * (Kılıç Savuruşu). Çok yakındakiler açıdan bağımsız vurulur.
   */
  damageInSector(
    x: number,
    y: number,
    z: number,
    dirX: number,
    dirZ: number,
    r: number,
    cosHalf: number,
    base: number,
    knock: number,
  ): void {
    if (this.torches.count > 0) this.hitTorchesInSector(x, z, dirX, dirZ, r, cosHalf);
    const e = this.enemies;
    const n = this.enemyGrid.query(x, z, r + 1, this.buf);
    for (let k = 0; k < n; k++) {
      const j = this.buf[k];
      if (j >= e.count || e.dead[j]) continue;
      const dx = e.x[j] - x;
      const dz = e.z[j] - z;
      const d = Math.hypot(dx, dz) || 1e-4;
      if (d > r + e.radius[j] || Math.abs(e.y[j] + e.hover[j] - y) > 2.5) continue;
      if (d > 1.2 && (dx * dirX + dz * dirZ) / d < cosHalf) continue;
      this.damageEnemy(j, base, (dx / d) * knock, (dz / d) * knock);
    }
  }

  private hitTorchesInSector(
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
    r: number,
    cosHalf: number,
  ): void {
    const t = this.torches;
    for (let i = t.count - 1; i >= 0; i--) {
      const dx = t.x[i] - x;
      const dz = t.z[i] - z;
      const d = Math.hypot(dx, dz) || 1e-4;
      if (d > r + TORCH.hitRadius) continue;
      if (d > 1.2 && (dx * dirX + dz * dirZ) / d < cosHalf) continue;
      this.breakTorch(i);
    }
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

      // Bumerang: ömrünün yarısında oyuncuya döner; dönüşte aynı düşmanlara tekrar vurabilir.
      const fl = pr.flags[i];
      if (fl & PF_RETURNS) {
        if (!(fl & PF_RETURNING) && pr.life[i] < pr.maxLife[i] * 0.5) {
          pr.flags[i] |= PF_RETURNING;
          pr.hitCount[i] = 0;
        }
        if (pr.flags[i] & PF_RETURNING) {
          const p = this.player;
          const dx = p.x - pr.x[i];
          const dz = p.z - pr.z[i];
          const d = Math.hypot(dx, dz);
          if (d < 1) {
            pr.dead[i] = 1;
            continue;
          }
          const speed = Math.hypot(pr.vx[i], pr.vz[i]);
          pr.vx[i] = (dx / d) * speed;
          pr.vz[i] = (dz / d) * speed;
        }
      }

      pr.x[i] += pr.vx[i] * dt;
      pr.z[i] += pr.vz[i] * dt;
      const ground = this.terrain.heightAt(pr.x[i], pr.z[i]);
      if (fl & PF_GROUND_FOLLOW) {
        // Göğüs hizasında araziyi takip et (tepelere çarpıp kaybolmasın).
        pr.y[i] += pr.vy[i] * dt;
        pr.y[i] += (ground + 1.1 - pr.y[i]) * Math.min(1, 10 * dt);
      } else {
        pr.y[i] += pr.vy[i] * dt;
        if (pr.y[i] < ground - 0.3) {
          pr.dead[i] = 1;
          continue;
        }
      }

      // Çarpışma: meşaleler (mermiyi tüketmez), sonra düşmanlar.
      const r = pr.radius[i];
      if (this.torches.count > 0) this.hitTorches(pr.x[i], pr.z[i], r);
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

  // ---------------------------------------------------------------- Meşaleler

  /** Meşale doğurur/kaldırır; oyuncu dokunursa kırar. */
  private updateTorches(dt: number): void {
    const t = this.torches;
    const p = this.player;
    for (let i = t.count - 1; i >= 0; i--) {
      const d2 = (t.x[i] - p.x) ** 2 + (t.z[i] - p.z) ** 2;
      if (d2 > TORCH.despawn * TORCH.despawn) t.removeAt(i);
      else if (d2 < TORCH.touchRadius ** 2 && Math.abs(p.y - this.terrain.heightAt(t.x[i], t.z[i])) < 2) {
        this.breakTorch(i);
      }
    }
    this.torchTimer -= dt;
    if (this.torchTimer > 0) return;
    this.torchTimer = TORCH.interval;
    let near = 0;
    for (let i = 0; i < t.count; i++) {
      if ((t.x[i] - p.x) ** 2 + (t.z[i] - p.z) ** 2 < TORCH.nearRadius ** 2) near++;
    }
    if (near < TORCH.maxNear) this.placeTorch();
  }

  /** Oyuncudan 15–30 m uzakta düz, engelsiz bir yere meşale koymayı dener. */
  private placeTorch(): boolean {
    const p = this.player;
    const n = this.tmp3;
    for (let tries = 0; tries < 16; tries++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(TORCH.minDist, TORCH.maxDist);
      const x = p.x + Math.sin(a) * r;
      const z = p.z + Math.cos(a) * r;
      const lim = this.terrain.playableHalf - 3;
      if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
      this.terrain.normalAt(x, z, n);
      if (n[1] < 0.85) continue;
      this.obstacles.resolve(x, z, 0.8, this.tmp2);
      if (Math.abs(this.tmp2[0] - x) > 1e-3 || Math.abs(this.tmp2[1] - z) > 1e-3) continue;
      return this.torches.add(x, z, this.rng.range(0, Math.PI * 2)) >= 0;
    }
    return false;
  }

  /** Meşaleyi kırar ve seviye/Şans'a göre bir ödül düşürür. */
  breakTorch(i: number): void {
    const t = this.torches;
    const x = t.x[i];
    const z = t.z[i];
    t.removeAt(i);
    const y = this.terrain.heightAt(x, z);
    this.breakFx.push(x, y, z, TORCH_FX);
    const k = this.rng.weightedIndex(torchDropWeights(this.level, this.stats.get('luck')));
    this.dropTorchReward(TORCH_DROPS[Math.max(0, k)].drop, x, y + 0.5, z);
  }

  private dropTorchReward(drop: TorchDrop, x: number, y: number, z: number): void {
    switch (drop) {
      case 'bag':
        this.dropPickup(PICKUP_BAG, x, y, z, this.rng.int(TORCH.bagMin, TORCH.bagMax));
        break;
      case 'chicken':
        this.dropPickup(PICKUP_HEAL, x, y, z, 1);
        break;
      case 'magnet':
        this.dropPickup(PICKUP_MAGNET, x, y, z, 1);
        break;
      case 'clock':
        this.dropPickup(PICKUP_CLOCK, x, y, z, 1);
        break;
      case 'rosary':
        this.dropPickup(PICKUP_ROSARY, x, y, z, 1);
        break;
    }
  }

  /** Silah vuruşları meşaleleri de kırar: (x,z) çevresinde r yarıçapındakiler. */
  private hitTorches(x: number, z: number, r: number): void {
    const t = this.torches;
    const rr = (r + TORCH.hitRadius) ** 2;
    for (let i = t.count - 1; i >= 0; i--) {
      if ((t.x[i] - x) ** 2 + (t.z[i] - z) ** 2 <= rr) this.breakTorch(i);
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
