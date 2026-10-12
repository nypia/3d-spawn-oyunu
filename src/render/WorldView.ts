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
import { ENEMIES } from '../data/enemies';
import { OBSTACLE_ROCK, OBSTACLE_TREE } from '../sim/world/Obstacles';
import type { World } from '../sim/world/World';
import {
  batGeometry,
  boltGeometry,
  gemGeometry,
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
  private readonly bolts: InstancedMesh;
  private readonly gems: InstancedMesh;
  private readonly puffs: InstancedMesh;
  private readonly aura: Group;
  private readonly auraRing: Mesh;
  private readonly puffList: Puff[] = [];
  private deathCursor = 0;

  constructor(
    enemyCapacity: number,
    private readonly shadows: boolean,
  ) {
    const enemyGeos = [slimeGeometry(), skeletonGeometry(), batGeometry()];
    this.enemyMeshes = ENEMIES.map((def, i) => {
      const mat = new MeshLambertMaterial({ color: def.color, vertexColors: true, flatShading: true });
      const mesh = instanced(enemyGeos[i % enemyGeos.length], mat, enemyCapacity, shadows);
      mesh.setColorAt(0, WHITE);
      mesh.name = `enemy:${def.id}`;
      this.root.add(mesh);
      return mesh;
    });

    this.bolts = instanced(boltGeometry(), new MeshBasicMaterial({ color: 0xaee9ff }), 768, false);
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

    this.root.add(this.bolts, this.gems, this.puffs, this.aura);
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
  }

  update(world: World, time: number, dt: number): void {
    this.updateEnemies(world, time);
    this.updateBolts(world);
    this.updateGems(world, time);
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
      let sx = def.scale;
      let sy = def.scale;
      let tilt = 0;
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
      }
      pos.set(e.x[i], y, e.z[i]);
      quat.setFromAxisAngle(UP, Math.atan2(e.vx[i], e.vz[i]));
      if (tilt !== 0) {
        quatTilt.setFromAxisAngle(FWD, tilt);
        quat.multiply(quatTilt);
      }
      scl.set(sx, sy, sx);
      m4.compose(pos, quat, scl);
      const k = counts[type]++;
      mesh.setMatrixAt(k, m4);
      mesh.setColorAt(k, e.flash[i] > 0 ? FLASH : WHITE);
    }
    this.enemyMeshes.forEach((mesh, t) => {
      mesh.count = counts[t];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }

  private updateBolts(world: World): void {
    const pr = world.projectiles;
    let k = 0;
    for (let i = 0; i < pr.count; i++) {
      if (pr.dead[i]) continue;
      pos.set(pr.x[i], pr.y[i], pr.z[i]);
      quat.identity();
      scl.setScalar(pr.radius[i]);
      m4.compose(pos, quat, scl);
      this.bolts.setMatrixAt(k++, m4);
    }
    this.bolts.count = k;
    this.bolts.instanceMatrix.needsUpdate = true;
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
      scl.setScalar(Math.max(0.01, s));
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
