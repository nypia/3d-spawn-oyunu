import {
  AdditiveBlending,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
  Vector3,
} from 'three';
import { PULSE_FREEZE, PULSE_HOLY, PULSE_MAGNET, PULSE_PHOENIX, type World } from '../sim/world/World';

const LIFE = 0.7;
const CAP = 24;
const COLORS: Record<number, Color> = {
  [PULSE_MAGNET]: new Color(0xff5a5a),
  [PULSE_FREEZE]: new Color(0x8fe6ff),
  [PULSE_HOLY]: new Color(0xfff2b0),
  [PULSE_PHOENIX]: new Color(0xff9a3d),
};

interface Pulse {
  x: number;
  y: number;
  z: number;
  radius: number;
  kind: number;
  t: number;
}

const m4 = new Matrix4();
const pos = new Vector3();
const quat = new Quaternion();
const scl = new Vector3();
const col = new Color();

/**
 * Yerde yayılan halka: Mıknatıs Taşı çekişi, Saat'in donma dalgası, Tespih, Anka dirilişi.
 * Toplamalı karışımla rengi siyaha solarak kaybolur.
 */
export class PulseFx {
  readonly mesh: InstancedMesh;
  private readonly list: Pulse[] = [];
  private cursor = 0;

  constructor() {
    this.mesh = new InstancedMesh(
      new RingGeometry(0.86, 1, 56).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
      CAP,
    );
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.setColorAt(0, col.setRGB(1, 1, 1));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  reset(world: World): void {
    this.list.length = 0;
    this.cursor = world.pulseFx.written;
  }

  update(world: World, dt: number): void {
    this.cursor = world.pulseFx.drain(this.cursor, (d, o) => {
      if (this.list.length >= CAP) this.list.shift();
      this.list.push({ x: d[o], y: d[o + 1], z: d[o + 2], radius: d[o + 3], kind: d[o + 4], t: 0 });
    });
    let k = 0;
    quat.identity();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      if (p.t >= LIFE) {
        this.list.splice(i, 1);
        continue;
      }
      const u = p.t / LIFE;
      const grow = 1 - (1 - u) ** 3;
      pos.set(p.x, world.terrain.heightAt(p.x, p.z) + 0.15, p.z);
      scl.setScalar(Math.max(0.01, p.radius * grow));
      m4.compose(pos, quat, scl);
      this.mesh.setMatrixAt(k, m4);
      col.copy(COLORS[p.kind] ?? COLORS[PULSE_HOLY]).multiplyScalar(1 - u);
      this.mesh.setColorAt(k, col);
      k++;
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
