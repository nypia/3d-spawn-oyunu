import { Rng } from '../../core/Rng';
import { BALANCE, xpToNext } from '../../data/balance';
import { BOSS } from '../../data/bosses';
import { CHEST_BOSS, CHEST_ELITE, CHEST_PLAIN, CHEST_TIERS } from '../../data/chests';
import {
  type DashParams,
  ELITE,
  ENEMIES,
  EXPLODER,
  type PhaseParams,
  type RangedParams,
  REGULAR_TYPES,
  SHOT_ORB,
} from '../../data/enemies';
import { EVOLUTION_BY_WEAPON } from '../../data/evolutions';
import { ITEM_FX, ITEM_INDEX, ITEMS } from '../../data/items';
import { ALTAR, CAULDRON } from '../../data/landmarks';
import { TOME_INDEX, TOMES, tomeValue } from '../../data/tomes';
import { TORCH, TORCH_DROPS, type TorchDrop, torchDropWeights } from '../../data/torches';
import {
  WEAPON_INDEX,
  WEAPONS,
  type WeaponBehavior,
  type WeaponSignature,
  weaponMaxLevel,
} from '../../data/weapons';
import { Blasts } from '../combat/Blasts';
import { Hazards, HZF_VISUAL } from '../combat/Hazards';
import {
  PF_CHILD,
  PF_GROUND_FOLLOW,
  PF_RETURNING,
  PF_RETURNS,
  PF_WHIRLED,
  PROJ_BOLT,
  ProjectilePool,
} from '../combat/ProjectilePool';
import { BossController } from '../enemies/Bosses';
import {
  EF_BOSS,
  EF_NOLOOT,
  EF_SPECIAL,
  EnemyPool,
  ST_ACT,
  ST_MOVE,
  ST_RECOVER,
  ST_WINDUP,
} from '../enemies/EnemyPool';
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
import {
  ESSENCE_DAMAGE,
  isBanishable,
  rollUpgrades,
  type UpgradeOption,
  upgradeKey,
} from '../progression/Upgrades';
import { SpatialGrid } from '../spatial/SpatialGrid';
import { Stats } from '../stats/Stats';
import { Heightmap } from '../terrain/Heightmap';
import {
  computeWeaponStats,
  createWeapon,
  levelUpWeapon,
  updateWeapon,
  type WeaponInstance,
} from '../weapons/Weapons';
import { ANN_BLOOD_MOON } from './announce';
import { EventRing } from './EventRing';
import { ALTAR as ALTAR_KIND, CAULDRON as CAULDRON_KIND, CHEST, Interactables, VASE } from './Interactables';
import { Landmarks } from './Landmarks';
import { Obstacles } from './Obstacles';
import { type RunOutcome, RunStats } from './RunStats';
import { TORCH_FX, Torches } from './Torches';

export interface WorldOptions {
  seed: number;
  /** Aynı anda en fazla kaç düşman (masaüstü/mobil farklı). */
  enemyCap?: number;
  godMode?: boolean;
  startWeapon?: string;
}

/** Sandıktan çıkan bir eşya. */
export interface ItemDrop {
  item: number;
  rarity: Rarity;
}

export type Reward =
  /** Sandık: `source` = sandık türü (CHEST_*), her eşya ayrı çarkta döner. */
  | { kind: 'item'; source: number; items: ItemDrop[] }
  /** Lanet Sunağı: `options` = PACTS indeksleri; takeReward(−1) reddeder. */
  | { kind: 'pact'; altar: number; options: number[] }
  /** Sandıktan evrim: `slot` = weapons dizisindeki silah. */
  | { kind: 'evolution'; slot: number };

/** spawnEnemy ek seçenekleri (boss, çağrılan, goblin). */
export interface SpawnOptions {
  /** Ek boy çarpanı (tanımın `scale`'i ve elit çarpanıyla çarpılır). */
  scale?: number;
  /** Ek can çarpanı. */
  hpMul?: number;
  /** EF_* bayrakları. */
  flags?: number;
}

/** Paktların düşmanlara ve oyuncuya uyguladığı kalıcı çarpanlar. */
export interface WorldMods {
  enemyHp: number;
  enemyDamage: number;
  enemySpeed: number;
  damageTaken: number;
  healing: number;
}

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
  /** Atış sesi/olayı yazılmaz (bölünen yavru mermiler). */
  silent?: boolean;
}

const PB = BALANCE.player;
/** Geri itilme hızının sönüm katsayısı (1/s): v hızı yaklaşık v/KNOCK_DECAY m yol aldırır. */
const KNOCK_DECAY = 7;
const XB = BALANCE.xp;

/** pulseFx türleri: yayılan halka efektinin rengi. */
export const PULSE_MAGNET = 0;
export const PULSE_FREEZE = 1;
export const PULSE_HOLY = 2;
export const PULSE_PHOENIX = 3;
export const PULSE_BLOOD = 4;
/** Evrim imzaları: Ruh Emme (can emme) ve Kara Delik (çekim). */
export const PULSE_DRAIN = 5;
export const PULSE_VOID = 6;

/** hitFx 5. alanı: 0 normal · 1 kritik · 2 infaz · 3 yanık tiki. */
export const HIT_CRIT = 1;
export const HIT_EXECUTE = 2;
export const HIT_BURN = 3;
/** Kan Ayı doğunca bu yarıçaptaki sıradan düşmanlar silinir. */
const BLOOD_MOON_PURGE = 45;
/** collectFx türü: XP taşı (pickup'lar 1 + PICKUP_* olarak yazılır). */
export const COLLECT_GEM = 0;
/** shotFx: düşman atışları SHOT_ENEMY + SHOT_ARROW / SHOT_ORB olarak yazılır. */
export const SHOT_ENEMY = 10;

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

  /** Render/ses için olay akışları. death: x,y,z,type,yön,boy · hit: x,y,z,hasar,kritik */
  readonly deathFx = new EventRing(256, 6);
  readonly hitFx = new EventRing(512, 5);
  /** Kılıç savuruşu: x,y,z,açı,menzil */
  readonly arcFx = new EventRing(32, 5);
  /** Şimşek: x1,y1,z1,x2,y2,z2 */
  readonly beamFx = new EventRing(128, 6);
  /** Patlama: x,y,z,yarıçap */
  readonly blastFx = new EventRing(64, 4);
  /** Kırılma/açılma: x,y,z,tür (Interactables türü),nadirlik (sandıkta en yüksek) */
  readonly breakFx = new EventRing(32, 5);
  /** Yayılan halka (mıknatıs, donma, kutsal, diriliş): x,y,z,yarıçap,tür (PULSE_*) */
  readonly pulseFx = new EventRing(16, 5);
  /** Toplama (ışıltı): x,y,z,tür (COLLECT_GEM ya da 1+PICKUP_*),değer */
  readonly collectFx = new EventRing(64, 5);
  /** HUD duyuruları: tür (ANN_*), değer, ek */
  readonly announceFx = new EventRing(16, 3);
  /** Kazana akan ruh: x,y,z (ölüm yeri),kazan indeksi,değer */
  readonly soulFx = new EventRing(128, 5);
  /** Hazine Goblini: x,y,z,kod (GOBLIN_*) */
  readonly goblinFx = new EventRing(16, 4);
  /** Ruh Kazanı, Lanet Sunağı, Hazine Goblini. */
  readonly landmarks = new Landmarks();
  /** Boss saldırılarının gecikmeli tehlike alanları. */
  readonly hazards = new Hazards(96);
  /** Atış sesi: x,y,z,tür (PROJ_* ya da SHOT_ENEMY + SHOT_*) */
  readonly shotFx = new EventRing(64, 4);
  /** Tetiklenen tehlike: x,z,x2,z2,tür,yarıçap */
  readonly hazardFx = new EventRing(64, 6);
  /** Boss saldırısına hazırlanıyor (uyarı sesi): x,z,saldırı kodu (ATTACK_KINDS sırası) */
  readonly telegraphFx = new EventRing(16, 3);
  readonly bosses = new BossController();
  /** Kamera sarsıntısı isteği (render okur): sayaç her istekte artar. */
  shakeSeq = 0;
  shakeAmp = 0;
  readonly blasts = new Blasts(48);

  enemyCap: number;
  godMode: boolean;

  time = 0;
  tick = 0;
  /** Kan Ayı döngüsü (1 = ilk gün) ve başladığı an. */
  cycle = 1;
  cycleStart = 0;
  /** Son Kan Ayı'nın doğduğu an (render geçişi; −1 = henüz yok). */
  bloodMoonAt = -1;
  readonly mods: WorldMods = { enemyHp: 1, enemyDamage: 1, enemySpeed: 1, damageTaken: 1, healing: 1 };
  /** Isabet sorgularına eklenen pay: en büyük düşman yarıçapı (büyük gövdeler ızgarada kaçmasın). */
  hitPad = 0.8;
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
  /** Koşu istatistikleri (silah başına hasar, öldürme…). */
  readonly run = new RunStats();
  /**
   * Şu an hasar veren silah yuvası (−1 = diğer: eşya, diken, kazan). Silah güncellemesi, mermi ve
   * patlama işlenirken ayarlanır; her kullanımdan sonra −1'e döner.
   */
  dmgSrc = -1;
  /** Yenilen final boss sayısı (Kan Ayı'na geçiş sayısı). */
  victories = 0;
  /** Koşunun bitiş biçimi (null = sürüyor). */
  outcome: RunOutcome | null = null;
  /** Hata ayıklama hilesi kullanıldı (rekor ve gümüş sayılmaz). */
  cheated = false;
  /** Yanık tiki işlenirken: imzalar yeniden tetiklenmez. */
  private procGuard = false;
  /** Sandık/sunak ödülü: doluysa oyun durur, oyuncu alır. */
  reward: Reward | null = null;
  /** Sıradaki ödüller (ör. boss sandığında önce evrim, sonra eşyalar). */
  readonly rewardQueue: Reward[] = [];
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
    this.interactables.populate(mapRng, this.terrain, this.obstacles, {
      chests: 12,
      cauldrons: 4,
      altars: 3,
      vaseGroups: 22,
    });

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

  /** Silah yuvasının evrim imzası (yuva yoksa ya da evrimleşmediyse undefined). */
  sigOf(src: number): WeaponSignature | undefined {
    return src >= 0 ? this.weapons[src]?.def.signature : undefined;
  }

  /** Koşuyu bitirir (zaferle ya da menüye dönerek); ölüm sim içinde olur. */
  finishRun(kind: RunOutcome): void {
    if (this.gameOver) return;
    this.outcome = kind;
    this.gameOver = true;
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

    for (let k = 0; k < this.weapons.length; k++) {
      this.dmgSrc = k;
      updateWeapon(this, this.weapons[k], dt);
    }
    this.dmgSrc = -1;
    this.updateProjectiles(dt);
    this.updateBlasts(dt);
    this.updateEnemies(dt);
    this.updateEnemyShots(dt);
    this.updateGems(dt);
    this.updatePickups(dt);
    this.updateInteractables();
    this.landmarks.update(this, dt);
    this.updateTorches(dt);
    this.bosses.update(this);
    this.updateHazards(dt);
    this.director.update(this, dt);

    e.removeDead();
    this.projectiles.removeDead();
    this.enemyShots.removeDead();
    this.gems.removeDead();
    this.pickups.removeDead();
    this.shieldCooldown = Math.max(0, this.shieldCooldown - dt);
    this.updateLodestone(dt);

    p.maxHp = this.stats.get('maxHp');
    this.heal(this.stats.get('regen') * dt);
    if (p.hp <= 0) {
      if (this.godMode) p.hp = p.maxHp;
      else if (this.itemCounts[ITEM_INDEX.phoenix] > 0) this.revive();
      else {
        p.hp = 0;
        this.outcome = 'death';
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
    if (!this.offer || !opt || !isBanishable(opt) || this.banishes <= 0) return false;
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
        this.run.weaponSince[this.weapons.length] = this.time;
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
        this.heal(opt.amount);
        break;
      case 'gold':
        this.gold += opt.amount;
        this.run.goldEarned += opt.amount;
        break;
      case 'essence':
        this.stats.addMult('damage', ESSENCE_DAMAGE * rarityMult(opt.rarity));
        break;
    }
  }

  /** Ödül ver: başka bir ödül açıksa sıraya girer. */
  pushReward(r: Reward): void {
    if (this.reward) this.rewardQueue.push(r);
    else this.reward = r;
  }

  /** Ödülü al: sandık eşyaları, evrim ya da pakt (choice = seçilen pakt, −1 = reddet). */
  takeReward(choice = 0): void {
    const r = this.reward;
    if (!r) return;
    if (r.kind === 'item') for (const d of r.items) this.applyItem(d.item);
    else if (r.kind === 'evolution') this.evolveWeapon(r.slot);
    else this.landmarks.takePact(this, r.altar, r.options, choice);
    this.reward = this.rewardQueue.shift() ?? null;
  }

  /** İyileşme (paktlar çarpanı düşürebilir). */
  heal(amount: number): void {
    const p = this.player;
    p.hp = Math.min(p.maxHp, p.hp + amount * this.mods.healing);
  }

  /** Silah evrime hazır mı: maks seviye, henüz evrimleşmemiş ve eşleşen kitap en az Sv.1. */
  canEvolve(w: WeaponInstance): boolean {
    const evo = EVOLUTION_BY_WEAPON[w.def.id];
    return !!evo && w.level >= weaponMaxLevel(w.def) && this.tomeLevels[TOME_INDEX[evo.tome]] > 0;
  }

  /** Evrime hazır ilk silahın yuvası (yoksa −1). Sandık açılınca eşya yerine evrim verir. */
  findEvolution(): number {
    return this.weapons.findIndex((w) => this.canEvolve(w));
  }

  /** Silahı evrimleştirir: yeni taban stat'lar + alınmış yükseltmeler korunur. */
  evolveWeapon(slot: number): void {
    const w = this.weapons[slot];
    if (!w || !this.canEvolve(w)) return;
    const evo = EVOLUTION_BY_WEAPON[w.def.id];
    w.def = evo.def;
    w.stats = computeWeaponStats(evo.def, w.applied);
    w.timer = 0;
    this.run.evolutions++;
    const p = this.player;
    this.pulseFx.push(p.x, p.y, p.z, 6, PULSE_HOLY);
  }

  /** Render için: bu davranıştaki silahın efekt rengi (evrimleşmediyse 0). */
  tintOf(behavior: WeaponBehavior): number {
    for (const w of this.weapons) if (w.def.behavior === behavior) return w.def.tint ?? 0;
    return 0;
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

  /**
   * Nadirlik zarına göre eşya seçer (en az `minRarity`); o kademede eşya yoksa bir alt kademeye iner.
   * `exclude`: tercihen tekrar çıkmasın istenen eşyalar (çok eşyalı sandık).
   */
  rollItem(luckBonus = 0, minRarity: Rarity = 0, exclude?: readonly number[]): ItemDrop {
    let rarity = Math.max(minRarity, rollRarity(this.rng, this.stats.get('luck') + luckBonus)) as Rarity;
    for (;;) {
      const all = ITEMS.map((d, i) => (d.rarity === rarity ? i : -1)).filter((i) => i >= 0);
      const fresh = exclude ? all.filter((i) => !exclude.includes(i)) : all;
      const pool = fresh.length > 0 ? fresh : all;
      if (pool.length > 0 || rarity === 0) return { item: this.rng.pick(pool), rarity };
      rarity = (rarity - 1) as Rarity;
    }
  }

  /** n farklı eşya (mümkünse). */
  rollItems(n: number, luckBonus = 0, minRarity: Rarity = 0): ItemDrop[] {
    const out: ItemDrop[] = [];
    for (let k = 0; k < n; k++) {
      out.push(
        this.rollItem(
          luckBonus,
          minRarity,
          out.map((d) => d.item),
        ),
      );
    }
    return out;
  }

  /**
   * Sandık açılır: evrime hazır silah varsa önce evrim; boss sandığı yine de eşyalarını verir.
   * Render'a en yüksek nadirlik gider (patlamanın büyüklüğü/rengi).
   */
  openChest(tier: number, x: number, y: number, z: number, minRarity?: Rarity): void {
    const t = CHEST_TIERS[tier] ?? CHEST_TIERS[CHEST_PLAIN];
    this.chestsOpened++;
    const slot = this.findEvolution();
    let best = 3;
    if (slot >= 0) this.pushReward({ kind: 'evolution', slot });
    if (slot < 0 || tier === CHEST_BOSS) {
      const items = this.rollItems(t.items, t.luck, minRarity ?? t.minRarity);
      best = Math.max(slot >= 0 ? 3 : 0, ...items.map((d) => d.rarity));
      this.pushReward({ kind: 'item', source: tier, items });
    }
    this.breakFx.push(x, y, z, CHEST, best);
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
    this.addBlast(p.x, p.z, ITEM_FX.phoenixRadius, ITEM_FX.phoenixDamage, 12, 0, -1);
    this.pulseFx.push(p.x, p.y, p.z, ITEM_FX.phoenixRadius * 1.6, PULSE_PHOENIX);
  }

  /** Düşmanı `seconds` boyunca dondurur (süre uzatılmaz, en uzunu geçerli). */
  freezeEnemy(i: number, seconds: number): void {
    const e = this.enemies;
    // Boss'lar donmaz.
    if (!e.dead[i] && !(e.flags[i] & EF_BOSS)) e.frozen[i] = Math.max(e.frozen[i], seconds);
  }

  /**
   * Final boss yenildi: dünya olduğu yerde kızıl geceye döner. Yeni döngü daha zor başlar (çizelge
   * 8:00'dan hızlı tekrar, daha güçlü düşmanlar, "Kanlı" boss'lar); oyun oyuncu ölene kadar sürer.
   */
  startBloodMoon(): void {
    this.victories++;
    this.cycle++;
    this.cycleStart = this.time;
    this.bloodMoonAt = this.time;
    const p = this.player;
    const e = this.enemies;
    const r2 = BLOOD_MOON_PURGE ** 2;
    let shown = 0;
    for (let i = 0; i < e.count; i++) {
      if (e.dead[i] || e.flags[i] & (EF_BOSS | EF_SPECIAL)) continue;
      if ((e.x[i] - p.x) ** 2 + (e.z[i] - p.z) ** 2 > r2) continue;
      e.dead[i] = 1;
      if (shown++ < 40) this.deathFx.push(e.x[i], e.y[i] + e.hover[i], e.z[i], e.type[i], 0, e.scale[i]);
    }
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.5);
    this.landmarks.rearm(this);
    this.director.startCycle(this);
    this.bosses.resetCycle();
    this.hazards.clear();
    this.pulseFx.push(p.x, p.y, p.z, BLOOD_MOON_PURGE, PULSE_BLOOD);
    this.announceFx.push(ANN_BLOOD_MOON, this.cycle, 0);
    this.shake(0.8);
  }

  /** Render'dan kamera sarsıntısı iste. */
  shake(amp: number): void {
    this.shakeSeq++;
    this.shakeAmp = amp;
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
    const dealt = this.player.takeDamage(amount * this.mods.damageTaken, this.stats.get('armor'));
    this.run.damageTaken += dealt;
    return dealt;
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
        this.collectFx.push(g.x[i], g.y[i], g.z[i], 1 + g.kind[i], g.value[i]);
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
    switch (kind) {
      case PICKUP_GOLD:
      case PICKUP_BAG: {
        const g = value * this.stats.get('goldGain');
        this.gold += g;
        this.run.goldEarned += g;
        break;
      }
      case PICKUP_HEAL:
        this.heal(BALANCE.loot.healAmount);
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
      const boss = e.flags[i] & EF_BOSS;
      if (!e.elite[i] && !boss) {
        this.killEnemy(i);
        continue;
      }
      const dmg = e.maxHp[i] * (boss ? BOSS.rosaryFrac : TORCH.rosaryEliteFrac);
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
  private updateInteractables(): void {
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
        this.breakFx.push(it.x[i], y, it.z[i], VASE, 0);
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
        const minRarity = free && it.level[i] > 0 ? (it.level[i] as Rarity) : undefined;
        this.openChest(free ? it.tier[i] : CHEST_PLAIN, it.x[i], y, it.z[i], minRarity);
      }
    }
  }

  /** HUD ipucu için: yakındaki kazan (dolum, soğuma) ya da sunak (yoksa null). */
  nearbyLandmark(): { kind: number; fill: number; cooldown: number; used: boolean } | null {
    const it = this.interactables;
    const p = this.player;
    for (let i = 0; i < it.count; i++) {
      const kind = it.kind[i];
      if (kind !== CAULDRON_KIND && kind !== ALTAR_KIND) continue;
      const r = kind === CAULDRON_KIND ? CAULDRON.radius + 1 : ALTAR.rearmDistance;
      if ((it.x[i] - p.x) ** 2 + (it.z[i] - p.z) ** 2 > r * r) continue;
      return { kind, fill: it.charge[i], cooldown: it.cooldown[i], used: it.used[i] === 1 };
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
        this.heal(ITEM_FX.bandageHeal * bandages);
      }
    }
  }

  // ---------------------------------------------------------------- Düşmanlar

  spawnEnemy(type: number, x: number, z: number, elite = false, opts?: SpawnOptions): number {
    const d = ENEMIES[type];
    const e = this.enemies;
    const i = e.add(type);
    if (i < 0) return -1;
    const dir = this.director;
    const t = this.time;
    const c = this.cycle;
    const m = this.mods;
    const hpMul = dir.hpMultiplier(t, c) * m.enemyHp * (opts?.hpMul ?? 1) * (elite ? ELITE.hp : 1);
    const scale = d.scale * (opts?.scale ?? 1) * (elite ? ELITE.scale : 1);
    const speed = d.speed * dir.speedMultiplier(t, c) * m.enemySpeed * this.rng.range(0.88, 1.12);
    e.x[i] = x;
    e.z[i] = z;
    e.y[i] = this.terrain.heightAt(x, z);
    e.hp[i] = e.maxHp[i] = d.hp * hpMul;
    e.damage[i] = d.damage * dir.damageMultiplier(t, c) * m.enemyDamage * (elite ? ELITE.damage : 1);
    e.speed[i] = Math.min(BALANCE.spawn.maxEnemySpeed, speed * (elite ? ELITE.speed : 1));
    e.radius[i] = d.radius * scale;
    e.hover[i] = d.hover;
    e.height[i] = d.height * scale;
    e.knockResist[i] = elite ? Math.min(0.9, d.knockbackResist + 0.5) : d.knockbackResist;
    e.xp[i] = d.xp * (elite ? ELITE.xp : 1) * (1 + XB.xpPerMinute * (t / 60));
    e.scale[i] = scale;
    e.elite[i] = elite ? 1 : 0;
    e.flags[i] = opts?.flags ?? 0;
    e.phase[i] = this.rng.range(0, Math.PI * 2);
    e.timer[i] = d.ranged ? this.rng.range(1, d.ranged.cooldown) : d.behavior === 'exploder' ? -1 : 0;
    return i;
  }

  private updateEnemies(dt: number): void {
    const e = this.enemies;
    const p = this.player;
    const buf = this.buf;
    const tmp = this.tmp2;
    const knockDecay = Math.exp(-KNOCK_DECAY * dt);
    const pr = PB.radius;
    let maxRadius = 0;

    for (let i = 0; i < e.count; i++) {
      if (e.dead[i]) continue;
      if (e.burn[i] > 0) {
        // Yanık: 0,25 sn'de bir tik (düşmanlar farklı karelerde yanar).
        e.burn[i] -= dt;
        if ((this.tick + e.uid[i]) % 15 === 0) {
          this.procGuard = true;
          this.dmgSrc = e.burnSrc[i];
          this.damageEnemy(i, e.burnDps[i] * 0.25, 0, 0);
          this.dmgSrc = -1;
          this.procGuard = false;
          if (e.dead[i]) continue;
        }
      }
      if (e.radius[i] > maxRadius) maxRadius = e.radius[i];
      const def = ENEMIES[e.type[i]];
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
        switch (def.behavior) {
          case 'ranged': {
            const r = def.ranged as RangedParams;
            // Mesafe koru: uzaksa yaklaş, yakınsa geri çekil, aradaysa yana kay.
            if (dist < r.minRange) {
              ux = -ux;
              uz = -uz;
              sp *= 0.8;
            } else if (dist <= r.maxRange) {
              const side = e.uid[i] & 1 ? 1 : -1;
              const tx = uz * side;
              uz = -ux * side;
              ux = tx;
              sp *= 0.35;
            }
            e.timer[i] -= dt;
            if (e.timer[i] <= 0 && dist < r.fireRange) {
              this.fireEnemyShot(i, r);
              e.timer[i] = r.cooldown * this.rng.range(0.85, 1.15);
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
          case 'phase': {
            // Hayalet: yana dalgalanarak süzülür (engellerden geçer, aşağıda).
            const ph = def.phase as PhaseParams;
            const wv = Math.sin(this.time * ph.weaveFreq + e.phase[i] * 3) * ph.weaveAmp;
            const tx = ux - uz * wv;
            const tz = uz + ux * wv;
            const tl = Math.hypot(tx, tz) || 1;
            ux = tx / tl;
            uz = tz / tl;
            break;
          }
          case 'boss': {
            const o = this.tmp3;
            this.bosses.steer(this, i, ux, uz, dist, dt, o);
            ux = o[0];
            uz = o[1];
            sp = o[2];
            break;
          }
          case 'flee': {
            // Hazine Goblini: oyuncudan kaçar; süresi dolar ya da çok uzaklaşırsa kaybolur.
            if (!this.landmarks.goblinMove(this, i, dist, dt)) continue;
            ux = -ux;
            uz = -uz;
            sp *= this.landmarks.goblinSpeed(this, i, dist);
            break;
          }
          case 'dasher': {
            const dash = def.dash as DashParams;
            const st = e.state[i];
            e.timer[i] -= dt;
            if (st === ST_MOVE) {
              if (e.timer[i] <= 0 && dist >= dash.triggerMin && dist <= dash.triggerMax) {
                e.state[i] = ST_WINDUP;
                e.timer[i] = dash.windup;
              }
            } else if (st === ST_WINDUP) {
              // Durup oyuncuyu süzer; hazırlık bitince o anki yöne kilitlenir.
              sp = 0;
              e.ax[i] = ux;
              e.az[i] = uz;
              if (e.timer[i] <= 0) {
                e.state[i] = ST_ACT;
                e.timer[i] = dash.time;
              }
            } else if (st === ST_ACT) {
              ux = e.ax[i];
              uz = e.az[i];
              sp = dash.speed;
              if (e.timer[i] <= 0) {
                e.state[i] = ST_RECOVER;
                e.timer[i] = dash.recover;
              }
            } else {
              sp *= 0.2;
              if (e.timer[i] <= 0) {
                e.state[i] = ST_MOVE;
                e.timer[i] = dash.cooldown * this.rng.range(0.8, 1.2);
              }
            }
            break;
          }
          default:
            break;
        }
      const vx = ux * sp;
      const vz = uz * sp;
      // Donukken son yönü koru (render yüz yönü için).
      if (!frozen) {
        e.vx[i] = vx;
        e.vz[i] = vz;
        e.travel[i] += sp * dt;
      }

      // Ayrışma (uzaktakiler için 3 tick'te bir — LOD).
      let sx = 0;
      let sz = 0;
      const isBoss = e.flags[i] & EF_BOSS;
      if (!isBoss && (dist < 30 || (i + this.tick) % 3 === 0)) {
        const ri = e.radius[i];
        const n = this.enemyGrid.query(x, z, ri + Math.max(0.7, this.hitPad), buf);
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
          // Boss kalabalığı yararak ilerler.
          const push = (minD - d) * (e.flags[j] & EF_BOSS ? 1.5 : 0.5);
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

      // Hayaletler ve havadaki (zıplayan) boss engellerden geçer.
      if (def.behavior === 'phase' || e.hover[i] > 1.5) {
        tmp[0] = nx;
        tmp[1] = nz;
      } else this.obstacles.resolve(nx, nz, e.radius[i], tmp);
      nx = this.terrain.clampToPlayable(tmp[0]);
      nz = this.terrain.clampToPlayable(tmp[1]);
      e.x[i] = nx;
      e.z[i] = nz;
      e.y[i] = this.terrain.heightAt(nx, nz);

      // Oyuncu ile temas: gövdeler dikeyde örtüşüyorsa iç içe girmesinler, temas hasarı uygula
      // (yarasa yerdeki oyuncuya vurur; zıplayan oyuncu alçak düşmanın üstünden geçer).
      const cx = p.x - nx;
      const cz = p.z - nz;
      const minD = e.radius[i] + pr;
      const c2 = cx * cx + cz * cz;
      const bottom = e.y[i] + e.hover[i];
      if (c2 < minD * minD && bottom < p.y + PB.height && bottom + e.height[i] > p.y) {
        const d = Math.sqrt(c2) || 1e-4;
        const overlap = minD - d;
        e.x[i] -= (cx / d) * overlap * 0.7;
        e.z[i] -= (cz / d) * overlap * 0.7;
        p.x += (cx / d) * overlap * 0.3;
        p.z += (cz / d) * overlap * 0.3;
        if (e.contactCd[i] <= 0 && e.damage[i] > 0) this.contact(i, cx / d, cz / d, frozen);
      }
    }
    this.hitPad = Math.max(0.8, maxRadius);
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
    e.contactCd[i] = PB.contactCooldown * (e.flags[i] & EF_BOSS ? BOSS.contactCooldownMul : 1);
    const dash = ENEMIES[e.type[i]].dash;
    const charging = e.state[i] === ST_ACT;
    const mul = !charging ? 1 : dash ? dash.damageMul : e.flags[i] & EF_BOSS ? BOSS.dashDamageMul : 1;
    const dealt = this.hurtPlayer(e.damage[i] * mul);
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
    this.run.addDamage(this.dmgSrc, dmg);
    const code = this.procGuard ? HIT_BURN : crit ? HIT_CRIT : 0;
    this.hitFx.push(e.x[i], e.y[i] + e.hover[i] + 1, e.z[i], dmg, code);
    // Evrim imzaları: infaz ve yanık.
    const sig = this.procGuard ? undefined : this.sigOf(this.dmgSrc);
    if (sig && e.hp[i] > 0) {
      if (sig.kind === 'execute' && !(e.flags[i] & EF_BOSS) && e.hp[i] < e.maxHp[i] * sig.threshold) {
        const rest = e.hp[i];
        e.hp[i] = 0;
        this.damageDealt += rest;
        this.run.addDamage(this.dmgSrc, rest);
        this.hitFx.push(e.x[i], e.y[i] + e.hover[i] + 1.4, e.z[i], rest, HIT_EXECUTE);
        this.heal(sig.heal);
      } else if (sig.kind === 'burn') {
        e.burn[i] = sig.time;
        e.burnDps[i] = base * sig.dpsMul;
        e.burnSrc[i] = this.dmgSrc;
      }
    }
    if (e.hp[i] <= 0) {
      this.killEnemy(i);
      return;
    }
    if (e.flags[i] & EF_SPECIAL) this.landmarks.goblinHit(this, i);
    const frost = this.itemCounts[ITEM_INDEX.frost];
    if (frost > 0 && this.rng.chance(Math.min(ITEM_FX.frostMaxChance, ITEM_FX.frostChance * frost))) {
      this.freezeEnemy(i, ITEM_FX.frostTime);
    }
  }

  killEnemy(i: number): void {
    const e = this.enemies;
    e.dead[i] = 1;
    this.kills++;
    this.run.addKill(this.dmgSrc);
    const x = e.x[i];
    const z = e.z[i];
    const gy = this.terrain.heightAt(x, z) + 0.35;
    const yaw = Math.atan2(e.vx[i], e.vz[i]);
    if (e.flags[i] & EF_NOLOOT) {
      // Goblin: yalnızca altın; XP, sandık, ruh ve eşya tetikleri yok.
      if (e.flags[i] & EF_SPECIAL) this.landmarks.goblinDeath(this, i);
      this.deathFx.push(x, e.y[i] + e.hover[i], z, e.type[i], yaw, e.scale[i]);
      return;
    }
    this.landmarks.feed(this, i);
    this.gems.add(x, gy, z, e.xp[i], this.player.x, this.player.z);
    if (e.elite[i]) {
      // Elit: ücretsiz ödül sandığı + biraz altın.
      this.eliteKills++;
      this.interactables.addRewardChest(x, z, this.rng.range(0, Math.PI * 2), CHEST_ELITE);
      for (let c = 0; c < 3; c++) this.dropPickup(PICKUP_GOLD, x, gy, z, 2);
      if (this.rng.chance(BALANCE.loot.eliteMagnetChance)) this.dropPickup(PICKUP_MAGNET, x, gy + 0.1, z, 1);
    } else if (this.rng.chance(BALANCE.loot.goldDropChance)) {
      this.dropPickup(PICKUP_GOLD, x, gy, z, 1);
    }
    const fang = this.itemCounts[ITEM_INDEX.fang];
    if (fang > 0 && this.rng.chance(ITEM_FX.fangChance * fang)) {
      this.heal(ITEM_FX.fangHeal);
    }
    const skull = this.itemCounts[ITEM_INDEX.skull];
    if (skull > 0 && this.rng.chance(ITEM_FX.skullChance * skull)) {
      // Patlamayı kuyruğa al (zincirleme patlamalar özyineleme yapmasın).
      this.addBlast(x, z, ITEM_FX.skullRadius, ITEM_FX.skullDamage, 3, 0.05, -1);
    }
    if (e.flags[i] & EF_BOSS && this.bosses.onDeath(this, i)?.final) this.startBloodMoon();
    this.deathFx.push(x, e.y[i] + e.hover[i], z, e.type[i], yaw, e.scale[i]);
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

  private fireEnemyShot(i: number, r: RangedParams): void {
    const e = this.enemies;
    const p = this.player;
    const s = this.enemyShots;
    const j = s.add();
    if (j < 0) return;
    const orb = r.shot === SHOT_ORB;
    const ox = e.x[i];
    const oz = e.z[i];
    this.shotFx.push(ox, e.y[i], oz, SHOT_ENEMY + r.shot);
    // Ok göğüs hizasından oyuncuya nişan alır; küre yerin üstünde süzülür.
    const oy = orb ? this.terrain.heightAt(ox, oz) + 1.1 : e.y[i] + e.hover[i] + 1.2 * e.scale[i];
    const dx = p.x - ox;
    const dy = orb ? 0 : p.y + 1 - oy;
    const dz = p.z - oz;
    const len = Math.hypot(dx, dy, dz) || 1;
    s.x[j] = ox;
    s.y[j] = oy;
    s.z[j] = oz;
    s.vx[j] = (dx / len) * r.shotSpeed;
    s.vy[j] = (dy / len) * r.shotSpeed;
    s.vz[j] = (dz / len) * r.shotSpeed;
    s.life[j] = s.maxLife[j] = r.shotLife;
    s.radius[j] = r.shotRadius;
    s.homing[j] = r.homing;
    s.kind[j] = r.shot;
    if (orb) s.flags[j] = PF_GROUND_FOLLOW;
    s.damage[j] =
      r.shotDamage *
      this.director.damageMultiplier(this.time, this.cycle) *
      this.mods.enemyDamage *
      (e.elite[i] ? ELITE.damage : 1);
  }

  /** Boss küre dalgası gibi doğrudan düşman mermisi (yön birim vektör, yatay). */
  spawnEnemyShot(
    x: number,
    y: number,
    z: number,
    dirX: number,
    dirZ: number,
    speed: number,
    damage: number,
    kind: number,
    radius: number,
    life: number,
    homing: number,
  ): void {
    const s = this.enemyShots;
    const j = s.add();
    if (j < 0) return;
    s.x[j] = x;
    s.y[j] = y;
    s.z[j] = z;
    s.vx[j] = dirX * speed;
    s.vy[j] = 0;
    s.vz[j] = dirZ * speed;
    s.life[j] = s.maxLife[j] = life;
    s.radius[j] = radius;
    s.homing[j] = homing;
    s.kind[j] = kind;
    s.damage[j] = damage;
    if (kind === SHOT_ORB) s.flags[j] = PF_GROUND_FOLLOW;
  }

  /** Süresi dolan tehlike alanları patlar: içindeki (yeterince yükseğe zıplamamış) oyuncu hasar alır. */
  private updateHazards(dt: number): void {
    const h = this.hazards;
    const p = this.player;
    for (let i = h.count - 1; i >= 0; i--) {
      h.delay[i] -= dt;
      if (h.delay[i] > 0) continue;
      if (!(h.flags[i] & HZF_VISUAL)) {
        const ground = this.terrain.heightAt(p.x, p.z);
        if (h.contains(i, p.x, p.z, PB.radius) && p.y - ground < 1.2) this.hurtPlayer(h.damage[i]);
        this.hazardFx.push(h.x[i], h.z[i], h.x2[i], h.z2[i], h.kind[i], h.radius[i]);
      }
      h.removeAt(i);
    }
  }

  private updateEnemyShots(dt: number): void {
    const s = this.enemyShots;
    const p = this.player;
    for (let j = 0; j < s.count; j++) {
      if (s.dead[j]) continue;
      s.life[j] -= dt;
      if (s.homing[j] > 0) {
        // Yatay hızı oyuncuya doğru en fazla homing·dt kadar döndür.
        const want = Math.atan2(p.x - s.x[j], p.z - s.z[j]);
        const cur = Math.atan2(s.vx[j], s.vz[j]);
        let da = want - cur;
        da -= Math.round(da / (Math.PI * 2)) * Math.PI * 2;
        const max = s.homing[j] * dt;
        const a = cur + Math.max(-max, Math.min(max, da));
        const sp = Math.hypot(s.vx[j], s.vz[j]);
        s.vx[j] = Math.sin(a) * sp;
        s.vz[j] = Math.cos(a) * sp;
      }
      s.x[j] += s.vx[j] * dt;
      s.z[j] += s.vz[j] * dt;
      const ground = this.terrain.heightAt(s.x[j], s.z[j]);
      if (s.flags[j] & PF_GROUND_FOLLOW) s.y[j] += (ground + 1.1 - s.y[j]) * Math.min(1, 10 * dt);
      else s.y[j] += s.vy[j] * dt;
      if (s.life[j] <= 0 || s.y[j] < ground - 0.2) {
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

  /** `y` yüksekliği, düşmanın gövdesine (alt..üst) `pad` payıyla değiyor mu? */
  private verticalHit(j: number, y: number, pad: number): boolean {
    const e = this.enemies;
    const bottom = e.y[j] + e.hover[j];
    return y > bottom - pad && y < bottom + e.height[j] + pad;
  }

  /** Bir küre içindeki tüm düşmanlara hasar (aura, patlama). */
  /** r yarıçaptaki düşmanlara hasar; vurulan düşman sayısını döner. */
  damageInRadius(x: number, y: number, z: number, r: number, base: number, knock: number): number {
    if (this.torches.count > 0) this.hitTorches(x, z, r);
    const e = this.enemies;
    const n = this.enemyGrid.query(x, z, r + Math.max(1, this.hitPad), this.buf);
    let hits = 0;
    for (let k = 0; k < n; k++) {
      const j = this.buf[k];
      if (j >= e.count || e.dead[j]) continue;
      const dx = e.x[j] - x;
      const dz = e.z[j] - z;
      const rr = r + e.radius[j];
      const d2 = dx * dx + dz * dz;
      if (d2 > rr * rr || !this.verticalHit(j, y, 2.5)) continue;
      const d = Math.sqrt(d2) || 1e-4;
      this.damageEnemy(j, base, (dx / d) * knock, (dz / d) * knock);
      hits++;
    }
    return hits;
  }

  /**
   * Kara Delik: r içindeki düşmanları (boss hariç) merkeze doğru en fazla `strength` m çeker
   * (geri itilme hızı olarak; sönümle yaklaşık o kadar yol alırlar).
   */
  pullEnemies(x: number, z: number, r: number, strength: number): void {
    const e = this.enemies;
    const n = this.enemyGrid.query(x, z, r, this.buf);
    for (let k = 0; k < n; k++) {
      const j = this.buf[k];
      if (j >= e.count || e.dead[j] || e.flags[j] & EF_BOSS) continue;
      const dx = x - e.x[j];
      const dz = z - e.z[j];
      const d = Math.hypot(dx, dz);
      if (d > r || d < 0.3) continue;
      const v = ((1 - e.knockResist[j]) * Math.min(d, strength) * KNOCK_DECAY) / d;
      e.kx[j] += dx * v;
      e.kz[j] += dz * v;
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
    if (!o.silent) this.shotFx.push(o.x, o.y, o.z, o.kind);
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
    pr.src[i] = this.dmgSrc;
  }

  /** Işık Bölünmesi: öldüren mermi, düşmanın yerinden yelpaze gibi yavru mermilere bölünür. */
  private splitBolt(i: number, j: number): void {
    const sig = this.sigOf(this.projectiles.src[i]);
    const pr = this.projectiles;
    if (sig?.kind !== 'split' || pr.count > pr.capacity - 64) return;
    const e = this.enemies;
    const speed = Math.hypot(pr.vx[i], pr.vz[i]) || 1;
    const base = Math.atan2(pr.vx[i], pr.vz[i]);
    for (let k = 0; k < sig.count; k++) {
      const a = base + (sig.count === 1 ? 0 : (k / (sig.count - 1) - 0.5) * 2 * sig.spread);
      this.spawnProjectile({
        kind: PROJ_BOLT,
        x: e.x[j],
        y: pr.y[i],
        z: e.z[j],
        vx: Math.sin(a) * speed,
        vy: 0,
        vz: Math.cos(a) * speed,
        life: 0.9,
        damage: pr.damage[i] * sig.damageMul,
        radius: pr.radius[i] * 0.75,
        pierce: 1,
        knockback: pr.knockback[i] * 0.5,
        homing: 5,
        flags: PF_CHILD,
        silent: true,
      });
    }
  }

  /** Gecikmeli patlama (Havan; eşyalar `src = −1` verir). */
  addBlast(
    x: number,
    z: number,
    radius: number,
    damage: number,
    knockback: number,
    delay: number,
    src = this.dmgSrc,
  ): void {
    this.blasts.add(x, z, radius, damage, knockback, delay, src);
  }

  private updateBlasts(dt: number): void {
    const b = this.blasts;
    for (let i = b.count - 1; i >= 0; i--) {
      b.timer[i] -= dt;
      if (b.timer[i] > 0) continue;
      const y = this.terrain.heightAt(b.x[i], b.z[i]);
      this.dmgSrc = b.src[i];
      this.damageInRadius(b.x[i], y + 0.5, b.z[i], b.radius[i], b.damage[i], b.knockback[i]);
      this.dmgSrc = -1;
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
    const n = this.enemyGrid.query(x, z, r + Math.max(1, this.hitPad), this.buf);
    for (let k = 0; k < n; k++) {
      const j = this.buf[k];
      if (j >= e.count || e.dead[j]) continue;
      const dx = e.x[j] - x;
      const dz = e.z[j] - z;
      const d = Math.hypot(dx, dz) || 1e-4;
      if (d > r + e.radius[j] || !this.verticalHit(j, y, 2.5)) continue;
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
          const sig = this.sigOf(pr.src[i]);
          if (sig?.kind === 'whirl' && !(fl & PF_WHIRLED)) {
            // Girdap: dönmeden önce yerinde döner (ömür o kadar uzar).
            pr.flags[i] |= PF_WHIRLED;
            pr.aux[i] = sig.time;
            pr.life[i] += sig.time;
          } else if (pr.aux[i] <= 0) {
            pr.flags[i] |= PF_RETURNING;
            pr.hitCount[i] = 0;
          }
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

      if (pr.aux[i] > 0) {
        // Girdapta: yerinde kalır, belirli aralıkla aynı düşmanlara yeniden vurabilir.
        const sig = this.sigOf(pr.src[i]);
        const rehit = sig?.kind === 'whirl' ? sig.rehit : 0.2;
        const before = Math.ceil(pr.aux[i] / rehit);
        pr.aux[i] -= dt;
        if (Math.ceil(pr.aux[i] / rehit) !== before) pr.hitCount[i] = 0;
      } else {
        pr.x[i] += pr.vx[i] * dt;
        pr.z[i] += pr.vz[i] * dt;
      }
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
      const n = this.enemyGrid.query(pr.x[i], pr.z[i], r + this.hitPad, this.buf);
      for (let k = 0; k < n; k++) {
        const j = this.buf[k];
        if (j >= e.count || e.dead[j]) continue;
        const dx = e.x[j] - pr.x[i];
        const dz = e.z[j] - pr.z[i];
        const rr = r + e.radius[j];
        if (dx * dx + dz * dz > rr * rr) continue;
        if (!this.verticalHit(j, pr.y[i], 0.4 + r)) continue;
        if (pr.hasHit(i, e.uid[j])) continue;
        pr.rememberHit(i, e.uid[j]);
        const sp = Math.hypot(pr.vx[i], pr.vz[i]) || 1;
        const kb = pr.knockback[i];
        this.dmgSrc = pr.src[i];
        this.damageEnemy(j, pr.damage[i], (pr.vx[i] / sp) * kb, (pr.vz[i] / sp) * kb);
        if (e.dead[j] && pr.kind[i] === PROJ_BOLT && !(pr.flags[i] & PF_CHILD)) this.splitBolt(i, j);
        this.dmgSrc = -1;
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
        this.collectFx.push(g.x[i], g.y[i], g.z[i], COLLECT_GEM, g.value[i]);
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
      const type = REGULAR_TYPES[this.rng.int(0, REGULAR_TYPES.length - 1)];
      this.spawnEnemy(
        type,
        this.terrain.clampToPlayable(p.x + Math.sin(a) * r),
        this.terrain.clampToPlayable(p.z + Math.cos(a) * r),
      );
    }
  }
}
