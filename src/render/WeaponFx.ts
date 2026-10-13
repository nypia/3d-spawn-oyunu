import {
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  CircleGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  RingGeometry,
  Vector3,
} from 'three';
import { PROJ_AXE, PROJ_BOLT, PROJ_PELLET } from '../sim/combat/ProjectilePool';
import { orbitRadius, weaponCount } from '../sim/weapons/Weapons';
import type { World } from '../sim/world/World';
import { axeGeometry, boltGeometry, orbGeometry, pelletGeometry } from './shapes';

const UP = new Vector3(0, 1, 0);
const FWD = new Vector3(0, 0, 1);
const m4 = new Matrix4();
const pos = new Vector3();
const quat = new Quaternion();
const scl = new Vector3();
const dir = new Vector3();

const SWING_LIFE = 0.18;
const BEAM_LIFE = 0.15;

function instanced(geo: BufferGeometry, mat: Material, cap: number) {
  const m = new InstancedMesh(geo, mat, cap);
  m.instanceMatrix.setUsage(DynamicDrawUsage);
  m.count = 0;
  m.frustumCulled = false;
  return m;
}

interface Swing {
  x: number;
  y: number;
  z: number;
  angle: number;
  radius: number;
  t: number;
}

interface BeamSeg {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  t: number;
}

/**
 * Silah görselleri: mermiler (büyü oku, balta, saçma), yörünge taşları, kılıç yayı,
 * şimşek, havan uyarı halkaları. Sim'in durumundan ve olay akışlarından beslenir.
 */
export class WeaponFx {
  readonly root = new Group();
  private readonly bolts: InstancedMesh;
  private readonly axes: InstancedMesh;
  private readonly pellets: InstancedMesh;
  private readonly orbs: InstancedMesh;
  private readonly beams: InstancedMesh;
  private readonly rings: InstancedMesh;
  private readonly fills: InstancedMesh;
  private readonly shells: InstancedMesh;
  private readonly swingMeshes: Mesh[] = [];
  private readonly swings: Swing[] = [];
  private readonly beamSegs: BeamSeg[] = [];
  private arcCursor = 0;
  private beamCursor = 0;

  constructor() {
    this.bolts = instanced(boltGeometry(), new MeshBasicMaterial({ color: 0xaee9ff }), 768);
    this.axes = instanced(
      axeGeometry(),
      new MeshLambertMaterial({ vertexColors: true, flatShading: true }),
      64,
    );
    this.pellets = instanced(pelletGeometry(), new MeshBasicMaterial({ color: 0xffe08a }), 512);
    this.orbs = instanced(
      orbGeometry(),
      new MeshLambertMaterial({ vertexColors: true, emissive: 0x2a1f66, flatShading: true }),
      24,
    );
    this.orbs.castShadow = true;
    this.beams = instanced(
      new BoxGeometry(1, 1, 1),
      new MeshBasicMaterial({
        color: 0xd8f3ff,
        transparent: true,
        opacity: 0.95,
        blending: AdditiveBlending,
      }),
      384,
    );
    const flat = { transparent: true, depthWrite: false };
    this.rings = instanced(
      new RingGeometry(0.88, 1, 40).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: 0xff5a3d, opacity: 0.85, ...flat }),
      48,
    );
    this.fills = instanced(
      new CircleGeometry(1, 32).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: 0xff5a3d, opacity: 0.25, ...flat }),
      48,
    );
    this.shells = instanced(new IcosahedronGeometry(0.3, 0), new MeshBasicMaterial({ color: 0x2a2a33 }), 48);

    const swingGeo = new RingGeometry(0.35, 1, 18, 1, -Math.PI / 3, (Math.PI * 2) / 3).rotateX(-Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const m = new Mesh(
        swingGeo,
        new MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          side: DoubleSide,
          depthWrite: false,
          blending: AdditiveBlending,
        }),
      );
      m.visible = false;
      this.swingMeshes.push(m);
    }

    this.root.add(
      this.bolts,
      this.axes,
      this.pellets,
      this.orbs,
      this.beams,
      this.fills,
      this.rings,
      this.shells,
      ...this.swingMeshes,
    );
  }

  reset(world: World): void {
    this.swings.length = 0;
    this.beamSegs.length = 0;
    this.arcCursor = world.arcFx.written;
    this.beamCursor = world.beamFx.written;
  }

  update(world: World, time: number, dt: number): void {
    this.updateProjectiles(world, time);
    this.updateOrbs(world, time);
    this.updateSwings(world, dt);
    this.updateBeams(world, dt);
    this.updateBlasts(world);
  }

  private updateProjectiles(world: World, time: number): void {
    const pr = world.projectiles;
    let nb = 0;
    let na = 0;
    let np = 0;
    for (let i = 0; i < pr.count; i++) {
      if (pr.dead[i]) continue;
      pos.set(pr.x[i], pr.y[i], pr.z[i]);
      switch (pr.kind[i]) {
        case PROJ_BOLT:
          quat.identity();
          scl.setScalar(pr.radius[i]);
          m4.compose(pos, quat, scl);
          this.bolts.setMatrixAt(nb++, m4);
          break;
        case PROJ_AXE:
          quat.setFromAxisAngle(UP, time * 16 + i);
          scl.setScalar(pr.radius[i] / 0.55);
          m4.compose(pos, quat, scl);
          this.axes.setMatrixAt(na++, m4);
          break;
        case PROJ_PELLET:
          quat.identity();
          scl.setScalar(pr.radius[i] * 0.6);
          m4.compose(pos, quat, scl);
          this.pellets.setMatrixAt(np++, m4);
          break;
      }
    }
    for (const [mesh, n] of [
      [this.bolts, nb],
      [this.axes, na],
      [this.pellets, np],
    ] as const) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private updateOrbs(world: World, time: number): void {
    const p = world.player;
    let k = 0;
    for (const w of world.weapons) {
      if (w.def.behavior !== 'orbit') continue;
      const count = weaponCount(world, w);
      const r = orbitRadius(world, w);
      const s = Math.sqrt(world.stats.get('area'));
      for (let i = 0; i < count && k < 24; i++) {
        const a = w.phase + (i * Math.PI * 2) / count;
        pos.set(p.x + Math.sin(a) * r, p.y + 1.1 + Math.sin(time * 4 + i) * 0.12, p.z + Math.cos(a) * r);
        quat.setFromAxisAngle(UP, time * 3 + i);
        scl.setScalar(s);
        m4.compose(pos, quat, scl);
        this.orbs.setMatrixAt(k++, m4);
      }
    }
    this.orbs.count = k;
    this.orbs.instanceMatrix.needsUpdate = true;
  }

  private updateSwings(world: World, dt: number): void {
    this.arcCursor = world.arcFx.drain(this.arcCursor, (d, o) => {
      if (this.swings.length >= this.swingMeshes.length) this.swings.shift();
      this.swings.push({ x: d[o], y: d[o + 1], z: d[o + 2], angle: d[o + 3], radius: d[o + 4], t: 0 });
    });
    for (let i = this.swings.length - 1; i >= 0; i--) {
      this.swings[i].t += dt;
      if (this.swings[i].t > SWING_LIFE) this.swings.splice(i, 1);
    }
    this.swingMeshes.forEach((m, i) => {
      const s = this.swings[i];
      m.visible = !!s;
      if (!s) return;
      const u = s.t / SWING_LIFE;
      m.position.set(s.x, s.y - 0.35, s.z);
      // RingGeometry'nin 0 açısı +X; dünya yönü (sin a, cos a) için Y etrafında π/2 − a döndür.
      m.rotation.y = Math.PI / 2 - s.angle;
      m.scale.setScalar(s.radius * (0.75 + 0.25 * u));
      (m.material as MeshBasicMaterial).opacity = 0.8 * (1 - u);
    });
  }

  private updateBeams(world: World, dt: number): void {
    this.beamCursor = world.beamFx.drain(this.beamCursor, (d, o) => {
      // Zikzak: iki ara noktayı yana kaydırarak 3 parça.
      const ax = d[o];
      const ay = d[o + 1];
      const az = d[o + 2];
      const bx = d[o + 3];
      const by = d[o + 4];
      const bz = d[o + 5];
      let px = ax;
      let py = ay;
      let pz = az;
      for (let s = 1; s <= 3; s++) {
        const f = s / 3;
        const jitter = s < 3 ? 0.45 : 0;
        const nx = ax + (bx - ax) * f + (Math.random() - 0.5) * jitter;
        const ny = ay + (by - ay) * f + (Math.random() - 0.5) * jitter;
        const nz = az + (bz - az) * f + (Math.random() - 0.5) * jitter;
        if (this.beamSegs.length < 384)
          this.beamSegs.push({ ax: px, ay: py, az: pz, bx: nx, by: ny, bz: nz, t: 0 });
        px = nx;
        py = ny;
        pz = nz;
      }
    });
    let k = 0;
    for (let i = this.beamSegs.length - 1; i >= 0; i--) {
      const b = this.beamSegs[i];
      b.t += dt;
      if (b.t > BEAM_LIFE) {
        this.beamSegs.splice(i, 1);
        continue;
      }
      dir.set(b.bx - b.ax, b.by - b.ay, b.bz - b.az);
      const len = dir.length();
      if (len < 1e-3) continue;
      dir.divideScalar(len);
      quat.setFromUnitVectors(FWD, dir);
      pos.set((b.ax + b.bx) / 2, (b.ay + b.by) / 2, (b.az + b.bz) / 2);
      const thick = 0.12 * (1 - b.t / BEAM_LIFE) + 0.02;
      scl.set(thick, thick, len);
      m4.compose(pos, quat, scl);
      this.beams.setMatrixAt(k++, m4);
    }
    this.beams.count = k;
    this.beams.instanceMatrix.needsUpdate = true;
  }

  private updateBlasts(world: World): void {
    const b = world.blasts;
    quat.identity();
    for (let i = 0; i < b.count; i++) {
      const ground = world.terrain.heightAt(b.x[i], b.z[i]);
      const left = Math.max(0, b.timer[i] / b.total[i]);
      pos.set(b.x[i], ground + 0.07, b.z[i]);
      scl.setScalar(b.radius[i]);
      m4.compose(pos, quat, scl);
      this.rings.setMatrixAt(i, m4);
      scl.setScalar(b.radius[i] * (1 - left));
      m4.compose(pos, quat, scl);
      this.fills.setMatrixAt(i, m4);
      pos.y = ground + 0.3 + 16 * left ** 1.5;
      scl.setScalar(1);
      m4.compose(pos, quat, scl);
      this.shells.setMatrixAt(i, m4);
    }
    for (const m of [this.rings, this.fills, this.shells]) {
      m.count = b.count;
      m.instanceMatrix.needsUpdate = true;
    }
  }
}
