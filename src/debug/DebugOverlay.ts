import type { WebGLRenderer } from 'three';
import type { World } from '../sim/world/World';

/** `?debug` ile açılan performans paneli. */
export class DebugOverlay {
  private readonly el: HTMLPreElement;
  private frames = 0;
  private acc = 0;
  private fps = 0;
  private simMs = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('pre');
    this.el.className = 'debug';
    parent.append(this.el);
  }

  recordSim(ms: number): void {
    this.simMs = this.simMs * 0.9 + ms * 0.1;
  }

  update(dt: number, world: World, renderer: WebGLRenderer): void {
    this.frames++;
    this.acc += dt;
    if (this.acc < 0.5) return;
    this.fps = this.frames / this.acc;
    this.frames = 0;
    this.acc = 0;
    const info = renderer.info.render;
    this.el.textContent = [
      `FPS      ${this.fps.toFixed(0)}`,
      `sim      ${this.simMs.toFixed(2)} ms`,
      `düşman   ${world.enemies.count} / ${world.enemyCap}`,
      `mermi    ${world.projectiles.count}`,
      `xp taşı  ${world.gems.count}`,
      `draw     ${info.calls}`,
      `üçgen    ${info.triangles}`,
      `seed     ${world.seed}`,
      `god      ${world.godMode ? 'açık' : 'kapalı'}`,
      '',
      'G ölümsüz · J +100 düşman',
      'K seviye · L +1 dk',
    ].join('\n');
  }
}
