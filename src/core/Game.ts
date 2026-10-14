import { BALANCE } from '../data/balance';
import { EVOLUTION_BY_WEAPON } from '../data/evolutions';
import { ITEMS } from '../data/items';
import { SHRINE_BONUSES } from '../data/shrines';
import { TOME_INDEX, TOMES } from '../data/tomes';
import { DebugOverlay } from '../debug/DebugOverlay';
import type { GameAssets } from '../render/assets/loadAssets';
import { detectQuality, isTouchDevice, type QualitySettings } from '../render/Quality';
import { Renderer3D } from '../render/Renderer3D';
import type { PlayerInput } from '../sim/player/Player';
import { RARITIES } from '../sim/progression/Rarity';
import { describeUpgrade, slotUsage } from '../sim/progression/Upgrades';
import { World } from '../sim/world/World';
import { Hud } from '../ui/Hud';
import { Screens } from '../ui/Screens';
import { TouchControls } from '../ui/TouchControls';
import { type Flags, readFlags } from './flags';
import { Input } from './Input';
import { randomSeed } from './Rng';

type State = 'menu' | 'playing' | 'levelup' | 'reward' | 'paused' | 'gameover';

const STEP = BALANCE.simStep;
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
  private acc = 0;
  private lastHp = 0;
  private last = performance.now();

  constructor(root: HTMLElement, assets: GameAssets) {
    this.flags = readFlags(location.search, location.hash);
    this.quality = detectQuality(this.flags.quality);
    const bench = this.flags.bench;
    this.renderer = new Renderer3D(root, this.quality, Math.max(1200, bench), assets);
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
    this.screens.showStart(() => this.startRun());

    // Test ve hata ayıklama için konsoldan erişim.
    (window as unknown as { game: Game }).game = this;
  }

  /** Mevcut dünya (testler/konsol için). */
  get current(): { state: State; world: World } {
    return { state: this.state, world: this.world };
  }

  run(): void {
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private createWorld(): World {
    const bench = this.flags.bench;
    const world = new World({
      seed: this.flags.seed ?? randomSeed(),
      enemyCap: Math.max(this.quality.enemyCap, bench),
      godMode: bench > 0,
    });
    this.renderer.setWorld(world);
    return world;
  }

  private startRun(): void {
    if (this.world.time > 0) this.world = this.createWorld();
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
        const kind = this.world.reward?.kind;
        if (this.state === 'reward' && (kind === 'item' || kind === 'evolution')) this.takeReward(0);
      });
    }
    inp.onKey('KeyR', () => {
      if (this.state === 'levelup') this.reroll();
    });
    inp.onKey('Escape', () => {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    });
    for (const [code, i] of [
      ['Digit1', 0],
      ['Digit2', 1],
      ['Digit3', 2],
      ['Digit4', 3],
    ] as const) {
      inp.onKey(code, () => {
        if (this.state === 'levelup') this.pick(i);
        else if (this.state === 'reward' && this.world.reward?.kind === 'shrine') this.takeReward(i);
      });
    }
    inp.onLockChange = (locked) => {
      if (!locked && this.state === 'playing') this.pause();
    };
    this.renderer.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !inp.locked) inp.requestLock();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });

    if (this.debug) {
      inp.onKey('KeyG', () => {
        this.world.godMode = !this.world.godMode;
      });
      inp.onKey('KeyJ', () => this.world.spawnBurst(100));
      inp.onKey('KeyK', () => this.world.addXp(this.world.xpNext - this.world.xp + 0.01));
      inp.onKey('KeyL', () => {
        this.world.time += 60;
      });
    }
  }

  private pause(): void {
    this.setState('paused');
    this.input.exitLock();
    this.screens.showPause(
      this.world,
      () => this.resume(),
      () => {
        this.world = this.createWorld();
        this.startRun();
      },
    );
  }

  private resume(): void {
    this.input.clear();
    this.setState('playing');
    this.input.requestLock();
  }

  private pick(i: number): void {
    const offer = this.world.offer;
    if (!offer || i >= offer.length) return;
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
          if (w.banish(i)) this.showLevelUp();
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
    if (r.kind === 'shrine') {
      this.screens.showShrine(
        r.options.map((o) => {
          const def = SHRINE_BONUSES[o.bonus];
          return {
            icon: def.icon,
            title: def.describe(o.value),
            rarity: o.rarity,
            rarityName: RARITIES[o.rarity].name,
          };
        }),
        (i) => this.takeReward(i),
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
        },
        () => this.takeReward(0),
      );
      return;
    }
    const def = ITEMS[r.item];
    this.screens.showItem(
      {
        title: 'Sandık açıldı!',
        icon: def.icon,
        name: def.name,
        description: def.description,
        rarity: r.rarity,
        rarityName: RARITIES[r.rarity].name,
        owned: this.world.itemCounts[r.item],
      },
      () => this.takeReward(0),
    );
  }

  private takeReward(choice: number): void {
    this.world.takeReward(choice);
    if (this.world.offer) this.showLevelUp();
    else this.resume();
  }

  private reroll(): void {
    if (this.world.reroll()) this.showLevelUp();
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
      while (this.acc >= STEP && steps < MAX_STEPS_PER_FRAME && !w.paused) {
        w.step(this.simInput, STEP);
        this.simInput.jump = false;
        this.acc -= STEP;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
      this.debug?.recordSim(performance.now() - t0);

      if (w.player.hp < this.lastHp - 0.5) rig.addShake(0.22);
      this.lastHp = w.player.hp;

      if (w.gameOver) {
        this.setState('gameover');
        this.input.exitLock();
        this.screens.showGameOver(w, () => {
          this.world = this.createWorld();
          this.startRun();
        });
      } else if (w.reward) {
        this.showReward();
      } else if (w.offer) {
        this.showLevelUp();
      }
    }

    this.renderer.render(this.world, dt, this.state === 'menu');
    if (this.state !== 'menu') this.hud.update(this.world);
    this.debug?.update(dt, this.world, this.renderer.renderer);
  }
}
