import { type PerspectiveCamera, Vector3 } from 'three';
import type { Player } from '../sim/player/Player';
import type { Heightmap } from '../sim/terrain/Heightmap';

const MENU_DISTANCE = 5.2;
const MENU_PITCH = 0.16;

/**
 * 3. şahıs kamera: oyuncunun etrafında yaw/pitch ile döner, yumuşak takip eder,
 * araziye gömülmez. Yaw doğrudan uygulanır (kontrol gecikmesi olmasın), konum yumuşatılır.
 */
export class CameraRig {
  yaw = Math.PI;
  pitch = 0.42;
  distance = 10;
  sensitivity = 0.0025;
  /** 0 = menü (kahramana yakın vitrin çekimi), 1 = oyun kamerası; arada yumuşak geçiş. */
  blend = 0;
  private menuTime = 0;
  private readonly target = new Vector3();
  private initialized = false;
  private shake = 0;

  constructor(private readonly camera: PerspectiveCamera) {}

  addLook(dx: number, dy: number): void {
    this.yaw -= dx * this.sensitivity;
    this.pitch = Math.min(1.2, Math.max(-0.15, this.pitch + dy * this.sensitivity));
  }

  addShake(amount: number): void {
    this.shake = Math.min(0.6, this.shake + amount);
  }

  /** Kameraya göre ileri yön (XZ). */
  forward(): [number, number] {
    return [-Math.sin(this.yaw), -Math.cos(this.yaw)];
  }

  right(): [number, number] {
    return [Math.cos(this.yaw), -Math.sin(this.yaw)];
  }

  update(player: Player, terrain: Heightmap, dt: number, menu = false): void {
    const k = 1 - Math.exp(-3.5 * dt);
    this.blend += ((menu ? 0 : 1) - this.blend) * k;
    const b = this.blend;
    // Menüden oyuna geçerken kamera önden kahramanın arkasına süzülür.
    if (!menu && b < 0.97) {
      const behind = player.facing + Math.PI;
      this.yaw += Math.atan2(Math.sin(behind - this.yaw), Math.cos(behind - this.yaw)) * k;
    }
    const distance = MENU_DISTANCE + (this.distance - MENU_DISTANCE) * b;
    const pitch = MENU_PITCH + (this.pitch - MENU_PITCH) * b;
    const tx = player.x;
    const ty = player.y + 1.15 + 0.45 * b;
    const tz = player.z;
    if (!this.initialized) {
      this.target.set(tx, ty, tz);
      this.initialized = true;
    } else {
      const kXZ = 1 - Math.exp(-14 * dt);
      const kY = 1 - Math.exp(-7 * dt);
      this.target.x += (tx - this.target.x) * kXZ;
      this.target.z += (tz - this.target.z) * kXZ;
      this.target.y += (ty - this.target.y) * kY;
    }

    const cp = Math.cos(pitch);
    let cx = this.target.x + Math.sin(this.yaw) * cp * distance;
    let cy = this.target.y + Math.sin(pitch) * distance;
    let cz = this.target.z + Math.cos(this.yaw) * cp * distance;
    const ground = terrain.heightAt(cx, cz) + 0.7;
    if (cy < ground) cy = ground;

    if (this.shake > 0.001) {
      cx += (Math.random() - 0.5) * this.shake;
      cy += (Math.random() - 0.5) * this.shake;
      cz += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-10 * dt);
    }

    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(this.target);
  }

  /** Menüde kahramanı önden, 3/4 açıyla gösteren ve yavaşça salınan yakın çekim. */
  orbit(player: Player, terrain: Heightmap, dt: number): void {
    this.menuTime += dt;
    this.yaw = player.facing + 0.5 + Math.sin(this.menuTime * 0.25) * 0.4;
    this.update(player, terrain, dt, true);
  }
}
