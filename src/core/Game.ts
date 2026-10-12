import { BALANCE } from '../data/balance';
import { DebugOverlay } from '../debug/DebugOverlay';
import { detectQuality, isTouchDevice, type QualitySettings } from '../render/Quality';
import { Renderer3D } from '../render/Renderer3D';
import type { PlayerInput } from '../sim/player/Player';
import { describeUpgrade } from '../sim/progression/Upgrades';
import { World } from '../sim/world/World';
import { Hud } from '../ui/Hud';
import { Screens } from '../ui/Screens';
import { Input } from './Input';
import { randomSeed } from './Rng';

type State = 'menu' | 'playing' | 'levelup' | 'paused' | 'gameover';

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
  private readonly debug: DebugOverlay | null;
  private readonly quality: QualitySettings;
  private readonly params: URLSearchParams;
  private readonly simInput: PlayerInput = { moveX: 0, moveZ: 0, jump: false, slide: false };
  private acc = 0;
  private lastHp = 0;
  private last = performance.now();

  constructor(root: HTMLElement) {
    this.params = new URLSearchParams(location.search);
    this.quality = detectQuality(this.params);
    const bench = Number(this.params.get('bench') ?? 0);
    this.renderer = new Renderer3D(root, this.quality, Math.max(1200, bench));
    this.input = new Input(this.renderer.canvas);
    this.hud = new Hud(root);
    this.screens = new Screens(root);
    this.debug = this.params.has('debug') || bench > 0 ? new DebugOverlay(root) : null;

    this.world = this.createWorld();
    this.bindKeys();
    this.screens.showStart(() => this.startRun(), isTouchDevice());

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
    const seedParam = this.params.get('seed');
    const bench = Number(this.params.get('bench') ?? 0);
    const world = new World({
      seed: seedParam ? Number(seedParam) : randomSeed(),
      enemyCap: Math.max(this.quality.enemyCap, bench),
      godMode: bench > 0,
    });
    this.renderer.setWorld(world);
    return world;
  }

  private startRun(): void {
    if (this.world.time > 0) this.world = this.createWorld();
    const bench = Number(this.params.get('bench') ?? 0);
    if (bench > 0) this.world.spawnBurst(bench, 6, 45);
    this.lastHp = this.world.player.hp;
    this.acc = 0;
    this.input.clear();
    this.setState('playing');
    this.input.requestLock();
  }

  private setState(s: State): void {
    this.state = s;
    this.hud.setVisible(s !== 'menu');
    if (s === 'playing') this.screens.hide();
  }

  private bindKeys(): void {
    const inp = this.input;
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
    const offer = this.world.offer ?? [];
    this.screens.showLevelUp(
      this.world.level - this.world.pendingLevelUps + 1,
      offer.map(describeUpgrade),
      (i) => this.pick(i),
    );
  }

  private frame(dt: number): void {
    const w = this.world;
    if (this.state === 'playing') {
      const [dx, dy] = this.input.consumeLook();
      const rig = this.renderer.rig;
      rig.addLook(dx, dy);
      rig.yaw += this.input.rotateAxis() * dt * 2.2;

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
      } else if (w.offer) {
        this.showLevelUp();
      }
    }

    this.renderer.render(this.world, dt, this.state === 'menu');
    if (this.state !== 'menu') this.hud.update(this.world);
    this.debug?.update(dt, this.world, this.renderer.renderer);
  }
}
