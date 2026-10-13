import {
  AdditiveBlending,
  type BufferGeometry,
  CircleGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  RingGeometry,
  Vector3,
} from 'three';
import { ENEMIES, EXPLODER } from '../data/enemies';
import { CHEST } from '../sim/world/Interactables';
import { OBSTACLE_ROCK, OBSTACLE_TREE } from '../sim/world/Obstacles';
import type { World } from '../sim/world/World';
import {
  archerGeometry,
  arrowGeometry,
  batGeometry,
  bombGeometry,
  gemGeometry,
  golemGeometry,
  puffGeometry,
  rockGeometry,
  skeletonGeometry,
  slimeGeometry,
  treeGeometry,
} from './shapes';
import { createTerrainMesh } from './TerrainView';

const UP = new Vector3(0, 1, 0);
const FWD = new Vector3(0, 0, 1);
const quatTilt = new Quaternion();
const m4 = new Matrix4();
const pos = new Vector3();
const quat = new Quaternion();
const scl = new Vector3();
const col = new Color();
const WHITE = new Color(1, 1, 1);
const FLASH = new Color(3, 3, 3);
/** Elitler altın tonda parlar. */
const ELITE_TINT = new Color(1.7, 1.35, 0.55);
const FUSE_FLASH = new Color(3, 2.2, 1.2);
const ARROW_FWD = new Vector3(0, 0, 1);
const arrowDir = new Vector3();

function instanced(
  geo: BufferGeometry,
  mat: MeshLambertMaterial | MeshBasicMaterial,
  cap: number,
  shadows: boolean,
) {
  const m = new InstancedMesh(geo, mat, cap);
  m.instanceMatrix.setUsage(DynamicDrawUsage);
  m.count = 0;
  m.frustumCulled = false;
  m.castShadow = shadows;
  return m;
}

interface Puff {
  x: number;
  y: number;
  z: number;
  t: number;
  color: number;
  /** Boy çarpanı (havan patlaması büyük). */
  size: number;
}

/**
 * Sim durumunu her karede instanced mesh'lere yansıtır. Tür başına tek draw call.
 * Düşman animasyonları (zıplama, sallanma, kanat çırpma) instance matrisiyle prosedüreldir.
 */
export class WorldView {
  readonly root = new Group();
  private terrain: Mesh | null = null;
  private trees: InstancedMesh | null = null;
  private rocks: InstancedMesh | null = null;
  private readonly enemyMeshes: InstancedMesh[];
  private readonly gems: InstancedMesh;
  private readonly arrows: InstancedMesh;
  private readonly puffs: InstancedMesh;
  private readonly aura: Group;
  private readonly auraRing: Mesh;
  private readonly puffList: Puff[] = [];
  private deathCursor = 0;
  private blastCursor = 0;
  private breakCursor = 0;

  constructor(
    enemyCapacity: number,
    private readonly shadows: boolean,
  ) {
    const geoByShape = {
      blob: slimeGeometry,
      capsule: skeletonGeometry,
      bat: batGeometry,
      golem: golemGeometry,
      archer: archerGeometry,
      bomb: bombGeometry,
    };
    this.enemyMeshes = ENEMIES.map((def) => {
      const mat = new MeshLambertMaterial({ color: def.color, vertexColors: true, flatShading: true });
      const mesh = instanced(geoByShape[def.shape](), mat, enemyCapacity, shadows);
      mesh.setColorAt(0, WHITE);
      mesh.name = `enemy:${def.id}`;
      this.root.add(mesh);
      return mesh;
    });

    this.gems = instanced(
      gemGeometry(),
      new MeshLambertMaterial({ color: 0xffffff, emissive: 0x1b4a7a, flatShading: true }),
      2500,
      false,
    );
    this.gems.setColorAt(0, WHITE);
    this.puffs = instanced(
      puffGeometry(),
      new MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
      256,
      false,
    );
    this.puffs.setColorAt(0, WHITE);

    this.aura = new Group();
    const disc = new Mesh(
      new CircleGeometry(1, 40).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.16, depthWrite: false }),
    );
    this.auraRing = new Mesh(
      new RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({
        color: 0xffb04a,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.aura.add(disc, this.auraRing);
    this.aura.visible = false;

    this.arrows = instanced(
      arrowGeometry(),
      new MeshLambertMaterial({ vertexColors: true, emissive: 0x401018, flatShading: true }),
      256,
      false,
    );
    this.root.add(this.gems, this.puffs, this.aura, this.arrows);
  }

  /** Yeni run: araziyi ve statik dekoru yeniden kur. */
  setWorld(world: World): void {
    for (const m of [this.terrain, this.trees, this.rocks]) {
      if (!m) continue;
      this.root.remove(m);
      m.geometry.dispose();
    }
    this.terrain = createTerrainMesh(world.terrain);
    this.root.add(this.terrain);

    const o = world.obstacles;
    let nTree = 0;
    let nRock = 0;
    for (let i = 0; i < o.count; i++) o.kind[i] === OBSTACLE_TREE ? nTree++ : nRock++;
    const mat = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.trees = new InstancedMesh(treeGeometry(), mat, Math.max(1, nTree));
    this.rocks = new InstancedMesh(rockGeometry(), mat, Math.max(1, nRock));
    let ti = 0;
    let ri = 0;
    for (let i = 0; i < o.count; i++) {
      const s = o.scale[i];
      pos.set(o.x[i], world.terrain.heightAt(o.x[i], o.z[i]) - 0.1, o.z[i]);
      quat.setFromAxisAngle(UP, o.rotation[i]);
      if (o.kind[i] === OBSTACLE_ROCK) scl.set(s, s * 0.9, s);
      else scl.set(s, s, s);
      m4.compose(pos, quat, scl);
      if (o.kind[i] === OBSTACLE_TREE) this.trees.setMatrixAt(ti++, m4);
      else this.rocks.setMatrixAt(ri++, m4);
    }
    this.trees.count = ti;
    this.rocks.count = ri;
    for (const m of [this.trees, this.rocks]) {
      m.castShadow = this.shadows;
      m.receiveShadow = this.shadows;
      m.computeBoundingSphere();
      this.root.add(m);
    }
    this.puffList.length = 0;
    this.deathCursor = world.deathFx.written;
    this.blastCursor = world.blastFx.written;
    this.breakCursor = world.breakFx.written;
  }

  update(world: World, time: number, dt: number): void {
    this.updateEnemies(world, time);
    this.updateGems(world, time);
    this.updateArrows(world);
    this.updatePuffs(world, dt);

    const p = world.player;
    this.aura.visible = world.auraRadius > 0;
    if (this.aura.visible) {
      this.aura.position.set(p.x, world.terrain.heightAt(p.x, p.z) + 0.08, p.z);
      const pulse = 1 + Math.sin(time * 6) * 0.03;
      this.aura.scale.setScalar(world.auraRadius * pulse);
      this.auraRing.rotation.y = time * 0.8;
    }
  }

  private updateEnemies(world: World, time: number): void {
    const e = world.enemies;
    const counts = this.enemyMeshes.map(() => 0);
    for (let i = 0; i < e.count; i++) {
      if (e.dead[i]) continue;
      const type = e.type[i];
      const mesh = this.enemyMeshes[type];
      const def = ENEMIES[type];
      const ph = e.phase[i] + time * (4 + e.speed[i]);
      let y = e.y[i] + e.hover[i];
      let sx = def.scale * e.scale[i];
      let sy = def.scale * e.scale[i];
      let tilt = 0;
      let fusing = false;
      switch (def.shape) {
        case 'blob': {
          // Zıplayarak ilerleme + basık/uzun.
          const hop = Math.abs(Math.sin(ph * 0.8));
          y += hop * 0.35;
          sy *= 0.85 + hop * 0.3;
          sx *= 1.12 - hop * 0.15;
          break;
        }
        case 'capsule':
          tilt = Math.sin(ph) * 0.15;
          y += Math.abs(Math.cos(ph)) * 0.08;
          break;
        case 'bat':
          y += Math.sin(ph * 1.7) * 0.3;
          sx *= 0.75 + Math.abs(Math.sin(ph * 3)) * 0.5;
          break;
        case 'golem':
          tilt = Math.sin(ph * 0.6) * 0.08;
          y += Math.abs(Math.sin(ph * 0.6)) * 0.05;
          break;
        case 'archer':
          y += Math.abs(Math.sin(ph)) * 0.05;
          break;
        case 'bomb':
          if (e.timer[i] >= 0) {
            // Fitil yanıyor: şişer ve yanıp söner.
            fusing = true;
            const g = 1 + (1 - e.timer[i] / EXPLODER.fuse) * 0.45;
            sx *= g;
            sy *= g;
          } else {
            y += Math.abs(Math.sin(ph * 1.2)) * 0.2;
          }
          break;
      }
      pos.set(e.x[i], y, e.z[i]);
      // Okçu hep oyuncuya bakar (geri çekilirken bile).
      const yaw =
        def.behavior === 'ranged'
          ? Math.atan2(world.player.x - e.x[i], world.player.z - e.z[i])
          : Math.atan2(e.vx[i], e.vz[i]);
      quat.setFromAxisAngle(UP, yaw);
      if (tilt !== 0) {
        quatTilt.setFromAxisAngle(FWD, tilt);
        quat.multiply(quatTilt);
      }
      scl.set(sx, sy, sx);
      m4.compose(pos, quat, scl);
      const k = counts[type]++;
      mesh.setMatrixAt(k, m4);
      const blink = fusing && Math.floor(time * 12) % 2 === 0;
      mesh.setColorAt(k, e.flash[i] > 0 ? FLASH : blink ? FUSE_FLASH : e.elite[i] ? ELITE_TINT : WHITE);
    }
    this.enemyMeshes.forEach((mesh, t) => {
      mesh.count = counts[t];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }

  private updateArrows(world: World): void {
    const s = world.enemyShots;
    let k = 0;
    for (let j = 0; j < s.count; j++) {
      if (s.dead[j]) continue;
      arrowDir.set(s.vx[j], s.vy[j], s.vz[j]).normalize();
      quat.setFromUnitVectors(ARROW_FWD, arrowDir);
      pos.set(s.x[j], s.y[j], s.z[j]);
      scl.setScalar(1.2);
      m4.compose(pos, quat, scl);
      this.arrows.setMatrixAt(k++, m4);
    }
    this.arrows.count = k;
    this.arrows.instanceMatrix.needsUpdate = true;
  }

  private updateGems(world: World, time: number): void {
    const g = world.gems;
    let k = 0;
    for (let i = 0; i < g.count; i++) {
      if (g.dead[i]) continue;
      const v = g.value[i];
      const bob = g.pull[i] > 0 ? 0 : Math.sin(time * 3 + i) * 0.08;
      pos.set(g.x[i], g.y[i] + bob, g.z[i]);
      quat.setFromAxisAngle(UP, time * 2 + i);
      scl.setScalar(v >= 20 ? 1.8 : v >= 5 ? 1.35 : 1);
      m4.compose(pos, quat, scl);
      this.gems.setMatrixAt(k, m4);
      col.setHex(v >= 20 ? 0xff5a5a : v >= 5 ? 0x5dff8a : 0x5ad1ff);
      this.gems.setColorAt(k, col);
      k++;
    }
    this.gems.count = k;
    this.gems.instanceMatrix.needsUpdate = true;
    if (this.gems.instanceColor) this.gems.instanceColor.needsUpdate = true;
  }

  private updatePuffs(world: World, dt: number): void {
    this.deathCursor = world.deathFx.drain(this.deathCursor, (d, o) => {
      if (this.puffList.length >= 256) this.puffList.shift();
      this.puffList.push({
        x: d[o],
        y: d[o + 1] + 0.5,
        z: d[o + 2],
        t: 0,
        color: ENEMIES[d[o + 3]]?.color ?? 0xffffff,
        size: 1,
      });
    });
    this.blastCursor = world.blastFx.drain(this.blastCursor, (d, o) => {
      if (this.puffList.length >= 256) this.puffList.shift();
      this.puffList.push({
        x: d[o],
        y: d[o + 1] + 0.4,
        z: d[o + 2],
        t: 0,
        color: 0xff8a3d,
        size: d[o + 3] * 0.9,
      });
    });
    this.breakCursor = world.breakFx.drain(this.breakCursor, (d, o) => {
      if (this.puffList.length >= 256) this.puffList.shift();
      const chest = d[o + 3] === CHEST;
      this.puffList.push({
        x: d[o],
        y: d[o + 1] + 0.5,
        z: d[o + 2],
        t: 0,
        color: chest ? 0xffd54a : 0xc8743f,
        size: chest ? 1.6 : 0.9,
      });
    });
    let k = 0;
    for (let i = this.puffList.length - 1; i >= 0; i--) {
      const p = this.puffList[i];
      p.t += dt;
      if (p.t > 0.4) {
        this.puffList.splice(i, 1);
        continue;
      }
      const s = p.t < 0.15 ? 0.5 + (p.t / 0.15) * 0.9 : 1.4 * (1 - (p.t - 0.15) / 0.25);
      pos.set(p.x, p.y + p.t * 1.5, p.z);
      quat.identity();
      scl.setScalar(Math.max(0.01, s * p.size));
      m4.compose(pos, quat, scl);
      this.puffs.setMatrixAt(k, m4);
      col.setHex(p.color);
      this.puffs.setColorAt(k, col);
      k++;
    }
    this.puffs.count = k;
    this.puffs.instanceMatrix.needsUpdate = true;
    if (this.puffs.instanceColor) this.puffs.instanceColor.needsUpdate = true;
  }
}
