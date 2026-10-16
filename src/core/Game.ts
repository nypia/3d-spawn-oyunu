import { AudioManager } from '../audio/AudioManager';
import { SoundEvents } from '../audio/SoundEvents';
import type { MusicTrack } from '../audio/sounds';
import { BALANCE } from '../data/balance';
import { BOSSES } from '../data/bosses';
import { CHEST_PLAIN, CHEST_TIERS } from '../data/chests';
import { EVOLUTION_BY_WEAPON } from '../data/evolutions';
import { HEROES } from '../data/heroes';
import { ITEMS } from '../data/items';
import { META_UPGRADES } from '../data/metaUpgrades';
import { PACTS } from '../data/pacts';
import { TOME_INDEX, TOMES } from '../data/tomes';
import { DebugOverlay } from '../debug/DebugOverlay';
import { MetaStore } from '../meta/MetaStore';
import type { GameAssets } from '../render/assets/loadAssets';
import { detectQuality, isTouchDevice, type QualitySettings } from '../render/Quality';
import { Renderer3D } from '../render/Renderer3D';
import type { PlayerInput } from '../sim/player/Player';
import { RARITIES } from '../sim/progression/Rarity';
import { describeUpgrade, slotUsage } from '../sim/progression/Upgrades';
import { summarizeRun } from '../sim/world/RunStats';
import { World } from '../sim/world/World';
import type { RewardSounds } from '../ui/ChestReel';
import { Hud } from '../ui/Hud';
import { menuPanel, shopPanel } from '../ui/MenuScreens';
import { Screens } from '../ui/Screens';
import { TouchControls } from '../ui/TouchControls';
import { type Flags, readFlags } from './flags';
import { Input } from './Input';
import { randomSeed } from './Rng';

type State = 'menu' | 'playing' | 'levelup' | 'reward' | 'paused' | 'victory' | 'gameover';

const STEP = BALANCE.simStep;
/** package.json sürümü (vite define). */
const VERSION = __APP_VERSION__;
const MAX_STEPS_PER_FRAME = 5;

/**
 * Oyunun durum makinesi ve ana döngüsü.
 * Sim sabit 60 Hz adımla ilerler, render her karede yapılır.
 */
export class Game {
  private state: State = 'menu';
  private world: World;
  private readonly renderer: Renderer3D;
  private readonly input: Input;
  private readonly hud: Hud;
  private readonly screens: Screens;
  private readonly touch: TouchControls;
  private readonly debug: DebugOverlay | null;
  private readonly quality: QualitySettings;
  private readonly flags: Flags;
  private readonly simInput: PlayerInput = { moveX: 0, moveZ: 0, jump: false, slide: false };
  /** Ses: efektler, müzik ve sim olaylarından ses üretimi. */
  readonly audio = new AudioManager();
  /** Kalıcı ilerleme (gümüş, güçler, kahramanlar, rekor). */
  readonly meta = new MetaStore();
  /** Menüde bakılan kahraman (kilitli olabilir; oyun seçili açık kahramanla başlar). */
  private previewHero: string;
  private readonly soundEvents = new SoundEvents();
  /** Sandık çarkının ses kancaları. */
  private readonly rewardSounds: RewardSounds = {
    open: () => this.audio.play('creak'),
    tick: () => this.audio.play('tick', { rate: 0.9 + Math.random() * 0.25 }),
    reveal: (r) => this.revealSound(r),
  };
  private time = 0;
  private acc = 0;
  private lastHp = 0;
  private lastShake = 0;
  private last = performance.now();
  /** Beklenmeyen hata ya da grafik bağlamı kaybı: döngü durur, hata ekranı açık. */
  private halted = false;
  /** Zafer ekranı gösterilmiş final boss sayısı (yeni zafer → ekran). */
  private seenVictories = 0;

  constructor(root: HTMLElement, assets: GameAssets) {
    this.previewHero = this.meta.data.hero;
    this.flags = readFlags(location.search, location.hash);
    this.quality = detectQuality(this.flags.quality);
    const bench = this.flags.bench;
    this.renderer = new Renderer3D(
      root,
      this.quality,
      Math.max(1200, bench),
      assets,
      this.flags.quality === null && bench === 0,
    );
    this.input = new Input(this.renderer.canvas);
    this.hud = new Hud(root);
    // Katman sırası: canvas < HUD < dokunmatik kontroller < menüler (kartlara dokunulabilsin).
    this.touch = new TouchControls(root, isTouchDevice());
    this.touch.onPause = () => {
      if (this.state === 'playing') this.pause();
    };
    this.input.attachTouch(this.touch);
    this.screens = new Screens(root);
    this.debug = this.flags.debug || bench > 0 ? new DebugOverlay(root) : null;

    this.world = this.createWorld();
    this.bindKeys();
    this.bindAudio(root);
    this.showStart();

    // Test ve hata ayıklama için konsoldan erişim.
    (window as unknown as { game: Game }).game = this;
  }

  /**
   * Tarayıcılar sesi ancak bir kullanıcı etkileşiminden sonra açar: ilk dokunuş/tıklama/tuşta açılır.
   * Menü butonları tıklama sesi çalar (kartlar kendi seçim sesini çalar).
   */
  private bindAudio(root: HTMLElement): void {
    const unlock = () => this.audio.unlock();
    // iOS'ta yalnızca dokunuşun sonu (touchend/click) "kullanıcı hareketi" sayılabilir.
    for (const ev of ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click']) {
      document.addEventListener(ev, unlock, { capture: true, passive: true });
    }
    root.addEventListener(
      'click',
      (e) => {
        // Kartlar ve kendi sesi olan butonlar (yenile, atla) tıklama sesi çalmaz.
        const b = (e.target as HTMLElement).closest('button');
        if (b && !b.classList.contains('card') && b.dataset.sfx !== 'none') this.audio.play('click');
      },
      { capture: true },
    );
    this.hud.onSound = () => this.toggleMute();
    this.touch.onSound = () => this.toggleMute();
    this.hud.setMuted(this.audio.settings.muted);
    this.touch.setMuted(this.audio.settings.muted);
  }

  private toggleMute(): boolean {
    const muted = this.audio.toggleMute();
    this.hud.setMuted(muted);
    this.touch.setMuted(muted);
    return muted;
  }

  /** Nadirliğe göre açılış sesi; efsanevide müzik kısılır. */
  private revealSound(rarity: number): void {
    const a = this.audio;
    if (rarity >= 3) {
      a.duck(2);
      a.play('revealLegend');
    } else if (rarity === 2) a.play('revealEpic');
    else if (rarity === 1) a.play('revealRare');
    else a.play('revealCommon');
  }

  /** Durum ve dünyaya göre çalması gereken müzik. */
  private musicFor(): MusicTrack | null {
    if (this.state === 'menu') return 'menu';
    if (this.state === 'gameover') return null;
    const w = this.world;
    if (w.bosses.active.length > 0) return 'boss';
    return w.cycle > 1 ? 'blood' : 'day';
  }

  /** Ana menü: kahramanlar (seçilen arkada görünür), gümüş, rekor, dükkân. */
  private showStart(refresh = false): void {
    const meta = this.meta;
    this.renderer.setHero(this.previewHero);
    this.screens.showPanel(
      menuPanel(
        {
          version: VERSION,
          silver: meta.silver,
          persistent: meta.persistent,
          heroes: HEROES.map((def) => ({
            def,
            unlocked: meta.isUnlocked(def.id),
            selected: def.id === this.previewHero,
          })),
          best: meta.data.best,
        },
        {
          play: () => this.startRun(),
          selectHero: (id) => {
            this.previewHero = id;
            meta.selectHero(id);
            this.showStart(true);
          },
          unlockHero: (id) => {
            if (!meta.unlockHero(id)) return;
            this.audio.play('revealRare');
            meta.selectHero(id);
            this.showStart(true);
          },
          shop: () => this.showShop(),
        },
      ),
      'start-overlay',
      null,
      refresh,
    );
  }

  /** Dükkân: kalıcı güçler gümüşle alınır. */
  private showShop(refresh = false): void {
    const meta = this.meta;
    this.screens.showPanel(
      shopPanel(
        meta.silver,
        META_UPGRADES.map((def) => ({ def, rank: meta.rank(def.id), cost: meta.nextCost(def.id) })),
        {
          buy: (id) => {
            if (!meta.buy(id)) return;
            this.audio.play('coins');
            this.showShop(true);
          },
          back: () => this.showStart(),
        },
        meta.persistent,
      ),
      '',
      () => this.showStart(),
      refresh,
    );
  }

  /** Shader'ları önceden derler (açılış ekranı arkasında). */
  warmUp(): Promise<void> {
    return this.renderer.warmUp();
  }

  /** Mevcut dünya (testler/konsol için). */
  get current(): { state: State; world: World } {
    return { state: this.state, world: this.world };
  }

  /**
   * Ana döngü. Sıradaki kare hatadan önce istenir ve kare try/catch içinde çalışır: tek bir hata oyunu
   * sessizce dondurmak yerine hata ekranı açar.
   */
  run(): void {
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.halted) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      try {
        this.frame(dt);
      } catch (err) {
        this.crash(err);
      }
    };
    requestAnimationFrame(loop);
  }

  /** Hata ekranı: "Devam et" duraklatma menüsüne döner, "Yeniden yükle" sayfayı tazeler. */
  crash(err: unknown): void {
    if (this.halted) return;
    console.error(err);
    this.halted = true;
    this.input.exitLock();
    this.touch.setVisible(false);
    this.audio.setPaused(true);
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    this.screens.showError('Bir şeyler ters gitti', detail, [
      { label: 'Devam et', run: () => this.recover() },
      { label: 'Yeniden yükle', run: () => location.reload() },
    ]);
  }

  private recover(): void {
    this.halted = false;
    // Açık ekran (seviye, sandık, oyun sonu) duraklatmadan dönünce kare döngüsünce yeniden açılır.
    if (this.state === 'menu') this.showStart();
    else this.pause();
    this.run();
  }

  /** Grafik bağlamı kayboldu (sürücü sıfırlandı, sekme çok uzun arka planda): döngü bekler. */
  private contextLost(): void {
    if (this.halted) return;
    this.halted = true;
    this.input.exitLock();
    this.touch.setVisible(false);
    this.screens.showError('Grafik bağlamı kayboldu', 'Tarayıcı ekran kartı bağlantısını sıfırladı.', [
      { label: 'Yeniden yükle', run: () => location.reload() },
    ]);
  }

  private contextRestored(): void {
    if (!this.halted) return;
    this.screens.showError('Grafik geri geldi', '', [
      { label: 'Devam et', run: () => this.recover() },
      { label: 'Yeniden yükle', run: () => location.reload() },
    ]);
  }

  /** Yeni dünya: seçili kahraman ve kalıcı güçlerle (`seed` verilirse aynı harita). */
  private createWorld(seed = this.flags.seed ?? randomSeed()): World {
    const bench = this.flags.bench;
    const world = new World({
      seed,
      enemyCap: Math.max(this.quality.enemyCap, bench),
      godMode: bench > 0,
      loadout: bench > 0 ? undefined : this.meta.loadout(),
    });
    this.renderer.setWorld(world);
    return world;
  }

  private startRun(): void {
    // Menüde kahraman ya da güç değişmiş olabilir: dünya güncel donanımla (aynı haritada) kurulur.
    const fresh = this.world.time === 0 && !this.world.gameOver;
    this.world = this.createWorld(fresh ? this.world.seed : undefined);
    this.seenVictories = 0;
    if (this.flags.bench > 0) this.world.spawnBurst(this.flags.bench, 6, 45);
    this.lastHp = this.world.player.hp;
    this.acc = 0;
    this.input.clear();
    this.setState('playing');
    this.input.requestLock();
  }

  private setState(s: State): void {
    this.state = s;
    this.hud.setVisible(s !== 'menu');
    this.touch.setVisible(s === 'playing');
    if (s === 'playing') this.screens.hide();
  }

  private bindKeys(): void {
    const inp = this.input;
    for (const code of ['KeyE', 'Enter']) {
      inp.onKey(code, () => {
        if (this.state === 'victory') {
          this.continueVictory();
          return;
        }
        const kind = this.world.reward?.kind;
        if (this.state !== 'reward' || (kind !== 'item' && kind !== 'evolution')) return;
        // İlk basış çarkı atlatır, ikincisi ödülü alır.
        if (!this.screens.skipChest()) this.takeReward(0);
      });
    }
    inp.onKey('Space', () => {
      if (this.state === 'reward') this.screens.skipChest();
    });
    inp.onKey('KeyR', () => {
      if (this.state === 'levelup') this.reroll();
    });
    inp.onKey('KeyM', () => this.toggleMute());
    inp.onKey('Escape', () => {
      if (this.state === 'reward' && this.world.reward?.kind === 'pact') this.takeReward(-1);
      else if (this.state === 'playing') this.pause();
      else if (this.state === 'paused' && !this.screens.back()) this.resume();
    });
    for (const [code, i] of [
      ['Digit1', 0],
      ['Digit2', 1],
      ['Digit3', 2],
      ['Digit4', 3],
    ] as const) {
      inp.onKey(code, () => {
        if (this.state === 'levelup') this.pick(i);
        else if (this.state === 'reward' && this.world.reward?.kind === 'pact') this.takeReward(i);
      });
    }
    inp.onLockChange = (locked) => {
      if (!locked && this.state === 'playing') this.pause();
    };
    this.renderer.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !inp.locked) inp.requestLock();
    });
    document.addEventListener('visibilitychange', () => {
      this.audio.setHidden(document.hidden);
      if (document.hidden && this.state === 'playing') this.pause();
    });
    // Dokunmatikte ve iframe içinde kilit yok: odak kaybı (bildirim perdesi, başka pencere) da duraklatır.
    window.addEventListener('blur', () => {
      if (this.state === 'playing' && !document.hasFocus()) this.pause();
    });
    const canvas = this.renderer.canvas;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost();
    });
    canvas.addEventListener('webglcontextrestored', () => this.contextRestored());

    if (this.debug) {
      // Hileler: koşu rekor ve gümüş saymaz.
      const cheat = (fn: () => void) => () => {
        if (this.state !== 'playing') return;
        this.world.cheated = true;
        fn();
      };
      inp.onKey(
        'KeyG',
        cheat(() => {
          this.world.godMode = !this.world.godMode;
        }),
      );
      inp.onKey(
        'KeyJ',
        cheat(() => this.world.spawnBurst(100)),
      );
      inp.onKey(
        'KeyK',
        cheat(() => this.world.addXp(this.world.xpNext - this.world.xp + 0.01)),
      );
      inp.onKey(
        'KeyL',
        cheat(() => {
          this.world.time += 60;
        }),
      );
      // Final boss'u doğur ve öldür (zafer ekranı testi).
      inp.onKey(
        'KeyV',
        cheat(() => {
          const w = this.world;
          if (!w.bosses.spawn(w, BOSSES.length - 1)) return;
          const e = w.enemies;
          for (let i = 0; i < e.count; i++)
            if (e.uid[i] === w.bosses.active[w.bosses.active.length - 1].uid) w.damageEnemy(i, 1e12, 0, 0);
        }),
      );
    }
  }

  private pause(): void {
    this.setState('paused');
    this.input.exitLock();
    const a = this.audio;
    this.screens.showPause(
      this.world,
      {
        resume: () => this.resume(),
        restart: () =>
          this.screens.showConfirm(
            'Yeniden başla?',
            'Bu koşu biter, yeni bir haritada baştan başlarsın.',
            'Yeniden başla',
            () => {
              this.world = this.createWorld();
              this.startRun();
            },
            () => this.pause(),
          ),
        menu: () =>
          this.screens.showConfirm(
            'Ana menüye dön?',
            'Koşu burada biter; özetini görürsün.',
            'Koşuyu bitir',
            () => {
              this.world.finishRun('quit');
              this.endRun();
            },
            () => this.pause(),
          ),
      },
      {
        sfx: a.settings.sfx,
        music: a.settings.music,
        muted: a.settings.muted,
        setVolume: (kind, v) => a.setVolume(kind, v),
        toggleMute: () => this.toggleMute(),
      },
    );
  }

  /** Final boss yenildi: zafer ekranı (sim bu sırada adım atmaz). */
  private showVictory(): void {
    this.setState('victory');
    this.input.exitLock();
    this.audio.duck(2.5);
    this.audio.play('revealLegend');
    const w = this.world;
    const summary = summarizeRun(w);
    const silver = this.meta.previewSilver({ ...summary, outcome: 'victory' }, w.cheated || w.godMode);
    this.screens.showVictory(
      summary,
      () => this.continueVictory(),
      () => {
        w.finishRun('victory');
        this.endRun();
      },
      silver > 0 ? `Şimdi bitirirsen +${silver} 🥈 gümüş (zafer ×1,25). Devam edersen daha fazlası…` : '',
    );
  }

  private continueVictory(): void {
    if (this.state !== 'victory') return;
    this.seenVictories = this.world.victories;
    this.resume();
  }

  /** Koşu bitti (ölüm, zafer ya da menüye dönüş): özet ve rekor. */
  private endRun(): void {
    const w = this.world;
    this.setState('gameover');
    this.input.exitLock();
    const summary = summarizeRun(w);
    const result = this.meta.recordRun(summary, w.cheated || w.godMode, this.meta.data.hero);
    const lines: string[] = [];
    if (result.silver > 0) lines.push(`+${result.silver} 🥈 gümüş · toplam ${this.meta.silver}`);
    for (const hero of result.unlocked) lines.push(`🔓 ${hero.name} (${hero.title}) açıldı!`);
    if (w.cheated) lines.push('Hile kullanıldı: gümüş ve rekor sayılmaz');
    this.screens.showGameOver(
      summary,
      {
        restart: () => {
          this.world = this.createWorld();
          this.startRun();
        },
        menu: () => this.toMenu(),
      },
      {
        record: result.best && !w.cheated ? { best: result.best, isNew: result.isNew } : undefined,
        lines,
      },
    );
  }

  /** Ana menü: yeni (henüz başlamamış) dünya, kahraman seçimi. */
  private toMenu(): void {
    this.world = this.createWorld();
    this.setState('menu');
    this.showStart();
  }

  private resume(): void {
    this.input.clear();
    this.setState('playing');
    this.input.requestLock();
  }

  private pick(i: number): void {
    const offer = this.world.offer;
    if (!offer || i >= offer.length) return;
    this.audio.play('select');
    this.world.choose(i);
    if (this.world.offer) this.showLevelUp();
    else this.resume();
  }

  private showLevelUp(): void {
    this.setState('levelup');
    this.input.exitLock();
    const w = this.world;
    const offer = w.offer ?? [];
    const slots = slotUsage(w);
    this.screens.showLevelUp(
      w.level - w.pendingLevelUps + 1,
      offer.map((o) => describeUpgrade(o, slots)),
      slots,
      {
        pick: (i) => this.pick(i),
        banish: (i) => {
          if (!w.banish(i)) return;
          this.audio.play('banish');
          this.showLevelUp();
        },
        reroll: () => this.reroll(),
        skip: () => {
          if (!w.skip()) return;
          if (w.offer) this.showLevelUp();
          else this.resume();
        },
      },
      { rerolls: w.rerolls, banishes: w.banishes, skips: w.skips },
    );
  }

  private showReward(): void {
    const r = this.world.reward;
    if (!r) return;
    this.setState('reward');
    this.input.exitLock();
    if (r.kind === 'pact') {
      this.screens.showPact(
        r.options.map((k) => {
          const d = PACTS[k];
          return { icon: d.icon, name: d.name, boon: d.boonText, bane: d.baneText };
        }),
        (i) => this.takeReward(i),
        () => this.takeReward(-1),
      );
      return;
    }
    if (r.kind === 'evolution') {
      const w = this.world.weapons[r.slot];
      const evo = EVOLUTION_BY_WEAPON[w.def.id];
      this.screens.showEvolution(
        {
          fromIcon: w.def.icon,
          fromName: w.def.name,
          tomeIcon: TOMES[TOME_INDEX[evo.tome]].icon,
          icon: evo.def.icon,
          name: evo.def.name,
          description: evo.def.description,
          signature: `★ ${evo.def.signatureName}: ${evo.def.signatureText}`,
        },
        () => this.takeReward(0),
      );
      this.revealSound(3);
      return;
    }
    const tier = CHEST_TIERS[r.source] ?? CHEST_TIERS[0];
    this.screens.showChest(
      {
        title: r.source === CHEST_PLAIN ? 'Sandık açıldı!' : `${tier.name}!`,
        tier: r.source,
        items: r.items.map((d) => {
          const def = ITEMS[d.item];
          return {
            icon: def.icon,
            rarity: d.rarity,
            name: def.name,
            description: def.description,
            rarityName: RARITIES[d.rarity].name,
            owned: this.world.itemCounts[d.item],
          };
        }),
        pool: ITEMS.map((d) => ({ icon: d.icon, rarity: d.rarity })),
      },
      this.rewardSounds,
      () => this.takeReward(0),
    );
  }

  private takeReward(choice: number): void {
    this.world.takeReward(choice);
    if (this.world.reward) this.showReward();
    else if (this.world.offer) this.showLevelUp();
    else this.resume();
  }

  private reroll(): void {
    if (!this.world.reroll()) return;
    this.audio.play('reroll');
    this.showLevelUp();
  }

  /**
   * Dokunmatikte kamera, joystick ileri itilirken oyuncunun arkasına yumuşakça döner
   * (sağ elle sürekli kamera çevirmek zorunda kalınmasın).
   */
  private autoCamera(dt: number): void {
    const t = this.touch;
    if (!t.active || t.cameraDragging) return;
    const fwd = t.axes[0];
    const p = this.world.player;
    if (fwd < 0.2 || p.speed < 1) return;
    const rig = this.renderer.rig;
    let diff = p.facing + Math.PI - rig.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const maxStep = 1.2 * fwd * dt;
    rig.yaw += Math.max(-maxStep, Math.min(maxStep, diff));
  }

  private frame(dt: number): void {
    const w = this.world;
    if (this.state === 'playing') {
      const [dx, dy] = this.input.consumeLook();
      const rig = this.renderer.rig;
      rig.addLook(dx, dy);
      rig.yaw += this.input.rotateAxis() * dt * 2.2;
      this.autoCamera(dt);

      // Kamera yönüne göre dünya uzayı hareket vektörü.
      const [fwd, right] = this.input.axes();
      const [fx, fz] = rig.forward();
      const [rx, rz] = rig.right();
      this.simInput.moveX = fx * fwd + rx * right;
      this.simInput.moveZ = fz * fwd + rz * right;
      this.simInput.slide = this.input.slideHeld();
      this.simInput.jump = this.input.consumeJump();

      const t0 = performance.now();
      this.acc += dt;
      let steps = 0;
      // Final boss öldüğü adımda durulur: zafer ekranı.
      while (
        this.acc >= STEP &&
        steps < MAX_STEPS_PER_FRAME &&
        !w.paused &&
        w.victories === this.seenVictories
      ) {
        w.step(this.simInput, STEP);
        this.simInput.jump = false;
        this.acc -= STEP;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
      this.debug?.recordSim(performance.now() - t0);

      if (w.player.hp < this.lastHp - 0.5) rig.addShake(0.22);
      if (w.shakeSeq !== this.lastShake) {
        this.lastShake = w.shakeSeq;
        rig.addShake(w.shakeAmp);
      }
      this.lastHp = w.player.hp;

      if (w.gameOver) {
        this.endRun();
      } else if (w.victories !== this.seenVictories) {
        this.showVictory();
      } else if (w.reward) {
        this.showReward();
      } else if (w.offer) {
        this.showLevelUp();
      }
    }

    const live = this.state === 'playing';
    this.renderer.render(this.world, dt, this.state === 'menu', live);
    this.time += dt;
    const p = this.world.player;
    this.audio.setListener(p.x, p.z, this.renderer.rig.yaw);
    // Zafer ekranında ses ve HUD bekler: Kan Ayı duyurusu "Devam"dan sonra gelsin.
    const hudOn = this.state !== 'menu' && this.state !== 'victory';
    if (hudOn) this.soundEvents.update(this.world, this.audio, dt, this.time, live);
    this.audio.setMusic(this.musicFor());
    this.audio.setPaused(this.state === 'paused' || this.state === 'victory');
    if (hudOn) this.hud.update(this.world, this.renderer.rig.yaw);
    this.debug?.update(dt, this.world, this.renderer.renderer);
  }
}
