import {
  type BufferGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  type Material,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import type { Heightmap } from '../../sim/terrain/Heightmap';

/** Kameraya bundan yakın parçalar çizilmez (ekranı kapatan dev şekiller olmasın). */
const NEAR = 2.5;

const m4 = new Matrix4();
const pos = new Vector3();
const quat = new Quaternion();
const axis = new Vector3();
const scl = new Vector3();
const col = new Color();

const GRAVITY = 22;
const STRIDE = 14;

/**
 * Katı parçacıklar (kırık çömlek, kaya ve kemik parçaları, altın paralar): yerçekimiyle düşer,
 * araziden sekip durur, ömrünün sonunda küçülerek kaybolur. Tek instanced mesh.
 */
export class Debris {
  readonly mesh: InstancedMesh;
  private readonly f: Float32Array;
  private n = 0;
  private cursor = 0;

  constructor(geometry: BufferGeometry, material: Material, capacity: number, shadows = false) {
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.setColorAt(0, col.setRGB(1, 1, 1));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadows;
    this.mesh.count = 0;
    this.f = new Float32Array(capacity * STRIDE);
  }

  clear(): void {
    this.n = 0;
    this.cursor = 0;
  }

  /** Parça ekler: konum, hız, boy, renk (hex), ömür, dönme hızı (rad/s). */
  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    size: number,
    color: number,
    life: number,
    spin: number,
  ): void {
    const cap = this.mesh.instanceMatrix.count;
    let i: number;
    if (this.n < cap) i = this.n++;
    else {
      i = this.cursor;
      this.cursor = (this.cursor + 1) % cap;
    }
    const f = this.f;
    const o = i * STRIDE;
    f[o] = x;
    f[o + 1] = y;
    f[o + 2] = z;
    f[o + 3] = vx;
    f[o + 4] = vy;
    f[o + 5] = vz;
    f[o + 6] = 0;
    f[o + 7] = life;
    f[o + 8] = size;
    f[o + 9] = color;
    f[o + 10] = spin;
    // Rastgele dönme ekseni ve başlangıç açısı.
    f[o + 11] = Math.random() * Math.PI * 2;
    f[o + 12] = Math.random() * 2 - 1;
    f[o + 13] = Math.random() * Math.PI * 2;
  }

  update(terrain: Heightmap, dt: number, camera: Vector3): void {
    const f = this.f;
    const mesh = this.mesh;
    let k = 0;
    for (let i = 0; i < this.n; i++) {
      const o = i * STRIDE;
      f[o + 6] += dt;
      if (f[o + 6] >= f[o + 7]) {
        this.n--;
        if (i !== this.n) f.copyWithin(o, this.n * STRIDE, this.n * STRIDE + STRIDE);
        if (this.cursor >= this.n) this.cursor = 0;
        i--;
        continue;
      }
      f[o + 4] -= GRAVITY * dt;
      f[o] += f[o + 3] * dt;
      f[o + 1] += f[o + 4] * dt;
      f[o + 2] += f[o + 5] * dt;
      const ground = terrain.heightAt(f[o], f[o + 2]) + f[o + 8] * 0.4;
      if (f[o + 1] < ground) {
        // Sek: dikey hız yön değiştirip söner, yatayda sürtünme; yavaşlayınca dönmez.
        f[o + 1] = ground;
        f[o + 4] = Math.abs(f[o + 4]) < 2 ? 0 : -f[o + 4] * 0.35;
        f[o + 3] *= 0.6;
        f[o + 5] *= 0.6;
        f[o + 10] *= 0.6;
      }
      f[o + 11] += f[o + 10] * dt;
      if ((f[o] - camera.x) ** 2 + (f[o + 1] - camera.y) ** 2 + (f[o + 2] - camera.z) ** 2 < NEAR * NEAR)
        continue;
      const u = f[o + 6] / f[o + 7];
      const s = f[o + 8] * (u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1);
      pos.set(f[o], f[o + 1], f[o + 2]);
      const ax = f[o + 12];
      axis.set(
        Math.cos(f[o + 13]) * Math.sqrt(1 - ax * ax),
        ax,
        Math.sin(f[o + 13]) * Math.sqrt(1 - ax * ax),
      );
      quat.setFromAxisAngle(axis, f[o + 11]);
      scl.setScalar(Math.max(0.001, s));
      m4.compose(pos, quat, scl);
      mesh.setMatrixAt(k, m4);
      mesh.setColorAt(k, col.setHex(f[o + 9]));
      k++;
    }
    mesh.count = k;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}
