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
import { BALANCE } from '../data/balance';
import { ENEMIES, EXPLODER } from '../data/enemies';
import { GEM_TIERS, gemTier } from '../data/gems';
import { CHEST, SHRINE } from '../sim/world/Interactables';
import { OBSTACLE_ROCK, OBSTACLE_TREE } from '../sim/world/Obstacles';
import { TORCH_FX } from '../sim/world/Torches';
import type { World } from '../sim/world/World';
import type { GameAssets } from './assets/loadAssets';
import { BlobShadows } from './BlobShadows';
import { buildEnemyLooks, type EnemyLook } from './crowd/enemyLooks';
import { arrowGeometry, gemGeometry, puffGeometry, rockGeometry, treeGeometry } from './shapes';
import { createTerrainMesh } from './TerrainView';

const UP = new Vector3(0, 1, 0);
const m4 = new Matrix4();
const pos = new Vector3();
const quat = new Quaternion();
const scl = new Vector3();
const col = new Color();
const WHITE = new Color(1, 1, 1);
/** Elitler altın tonda parlar. */
const ELITE_TINT = new Color(1.7, 1.35, 0.55);
const FUSE_FLASH = new Color(3, 2.2, 1.2);
/** Donmuş düşman: buz mavisi. */
const ICE_TINT = new Color(0.55, 1.15, 1.9);
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

/** Ölen modelli düşman: kısa süre `die` klibini oynar, sonra yere gömülür. */
interface Corpse {
  type: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  t: number;
}

const CORPSE_LIFE = 1.1;
const CORPSE_CAP = 64;

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
  /** Tür başına animasyonlu kalabalık (CrowdMesh). */
  private readonly looks: (EnemyLook | null)[];
  private readonly lookCounts: number[];
  private readonly corpses: Corpse[] = [];
  private readonly blobs: BlobShadows;
  private readonly gems: InstancedMesh;
  private readonly arrows: InstancedMesh;
  private readonly puffs: InstancedMesh;
  private readonly aura: Group;
  private readonly auraRing: Mesh;
  private readonly auraDisc: Mesh;
  private readonly puffList: Puff[] = [];
  private deathCursor = 0;
  private blastCursor = 0;
  private breakCursor = 0;

  constructor(
    enemyCapacity: number,
    private readonly shadows: boolean,
    assets: GameAssets,
  ) {
    this.looks = buildEnemyLooks(assets, enemyCapacity + CORPSE_CAP);
    this.lookCounts = this.looks.map(() => 0);
    for (const look of this.looks) {
      if (!look) continue;
      look.crowd.setColorAt(0, WHITE);
      this.root.add(look.crowd);
    }
    this.blobs = new BlobShadows(enemyCapacity + CORPSE_CAP);
    this.root.add(this.blobs.mesh);

    this.gems = instanced(
      gemGeometry(),
      new MeshLambertMaterial({ color: 0xffffff, emissive: 0x1b4a7a, flatShading: true }),
      BALANCE.xp.gemCapacity,
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
    this.auraDisc = new Mesh(
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
    this.aura.add(this.auraDisc, this.auraRing);
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
    this.corpses.length = 0;
    this.deathCursor = world.deathFx.written;
    this.blastCursor = world.blastFx.written;
    this.breakCursor = world.breakFx.written;
  }

  update(world: World, time: number, dt: number): void {
    this.updateEnemies(world, time, dt);
    this.updateGems(world, time);
    this.updateArrows(world);
    this.updatePuffs(world, dt);

    const p = world.player;
    this.aura.visible = world.auraRadius > 0;
    if (this.aura.visible) {
      this.aura.position.set(p.x, world.terrain.heightAt(p.x, p.z) + 0.08, p.z);
      const pulse = 1 + Math.sin(time * 6) * 0.03;
      this.aura.scale.setScalar(world.auraRadius * pulse);
      // Cehennem Halesi (evrim) kendi renginde.
      const tint = world.tintOf('aura');
      (this.auraDisc.material as MeshBasicMaterial).color.setHex(tint || 0xff7a2a);
      (this.auraRing.material as MeshBasicMaterial).color.setHex(tint || 0xffb04a);
      this.auraRing.rotation.y = time * 0.8;
    }
  }

  private updateEnemies(world: World, time: number, dt: number): void {
    const e = world.enemies;
    this.lookCounts.fill(0);
    this.blobs.begin();
    for (let i = 0; i < e.count; i++) {
      if (e.dead[i]) continue;
      const type = e.type[i];
      const look = this.looks[type];
      if (!look) continue;
      this.blobs.add(world.terrain, e.x[i], e.z[i], ENEMIES[type].radius * e.scale[i] * 1.2, e.hover[i]);
      this.drawEnemy(world, look, i, time);
    }
    this.updateCorpses(dt);
    this.looks.forEach((look, t) => {
      look?.crowd.commit(this.lookCounts[t]);
    });
    this.blobs.end();
  }

  /** Düşman: konum/yön/boy, renk tonu ve animasyon karesi. */
  private drawEnemy(world: World, look: EnemyLook, i: number, time: number): void {
    const e = world.enemies;
    // Donmuş düşmanın animasyonu durur (yürüdüğü yol artmaz, poz sabit kalır).
    const frozen = e.frozen[i] > 0;
    const type = e.type[i];
    const def = ENEMIES[type];
    const k = this.lookCounts[type]++;
    pos.set(e.x[i], e.y[i] + e.hover[i], e.z[i]);
    const p = world.player;
    const yaw =
      def.behavior === 'ranged' ? Math.atan2(p.x - e.x[i], p.z - e.z[i]) : Math.atan2(e.vx[i], e.vz[i]);
    quat.setFromAxisAngle(UP, yaw);
    scl.setScalar(e.scale[i]);
    m4.compose(pos, quat, scl);
    const crowd = look.crowd;
    crowd.setMatrixAt(k, m4);
    const flash = e.flash[i] > 0 ? 0.9 : frozen ? -1 : 0;
    // Patlayanın fitili yanıyor: şişer ve turuncu yanıp söner.
    const fusing = !!look.fuse && e.timer[i] >= 0;
    const blink = fusing && !frozen && Math.floor(time * 12) % 2 === 0;
    crowd.setColorAt(k, frozen ? ICE_TINT : blink ? FUSE_FLASH : e.elite[i] ? ELITE_TINT : WHITE);
    // Okçu atıştan hemen önce yayı çeker; diğerleri yürüdükleri yol kadar adım atar.
    const draw = 0.6;
    if (look.fuse && fusing) {
      crowd.setAnim(k, look.fuse, EXPLODER.fuse - e.timer[i], flash);
    } else if (look.shoot && !frozen && e.timer[i] >= 0 && e.timer[i] < draw) {
      crowd.setAnim(k, look.shoot, ((draw - e.timer[i]) / draw) * look.shoot.duration, flash);
    } else {
      const cycle = (e.travel[i] + e.phase[i] * look.stride) / look.stride;
      crowd.setAnim(k, look.walk, cycle * look.walk.duration, flash);
    }
  }

  /** Cesetler: canlıların ardından aynı kalabalığa çizilir. */
  private updateCorpses(dt: number): void {
    for (let c = this.corpses.length - 1; c >= 0; c--) {
      const k = this.corpses[c];
      k.t += dt;
      if (k.t > CORPSE_LIFE) {
        this.corpses.splice(c, 1);
        continue;
      }
      const look = this.looks[k.type];
      if (!look) continue;
      const slot = this.lookCounts[k.type]++;
      const sink = Math.max(0, k.t - 0.65) * 1.8;
      pos.set(k.x, k.y - sink, k.z);
      quat.setFromAxisAngle(UP, k.yaw);
      scl.setScalar(k.scale);
      m4.compose(pos, quat, scl);
      look.crowd.setMatrixAt(slot, m4);
      look.crowd.setColorAt(slot, WHITE);
      look.crowd.setAnim(slot, look.die, k.t * 0.6, 0);
    }
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
      const tier = GEM_TIERS[gemTier(g.value[i])];
      const bob = g.pull[i] > 0 ? 0 : Math.sin(time * 3 + i) * 0.08;
      pos.set(g.x[i], g.y[i] + bob, g.z[i]);
      quat.setFromAxisAngle(UP, time * 2 + i);
      scl.setScalar(tier.scale);
      m4.compose(pos, quat, scl);
      this.gems.setMatrixAt(k, m4);
      col.setHex(tier.color);
      this.gems.setColorAt(k, col);
      k++;
    }
    this.gems.count = k;
    this.gems.instanceMatrix.needsUpdate = true;
    if (this.gems.instanceColor) this.gems.instanceColor.needsUpdate = true;
  }

  private updatePuffs(world: World, dt: number): void {
    this.deathCursor = world.deathFx.drain(this.deathCursor, (d, o) => {
      const type = d[o + 3];
      if (this.looks[type]) {
        if (this.corpses.length >= CORPSE_CAP) this.corpses.shift();
        const p = world.player;
        const yaw = ENEMIES[type].behavior === 'ranged' ? Math.atan2(p.x - d[o], p.z - d[o + 2]) : d[o + 4];
        this.corpses.push({ type, x: d[o], y: d[o + 1], z: d[o + 2], yaw, scale: d[o + 5], t: 0 });
        return;
      }
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
        // Büyük patlamalarda puf ekranı kapatmasın; yarıçapı yayılan halka gösterir.
        size: Math.min(3, d[o + 3] * 0.9),
      });
    });
    this.breakCursor = world.breakFx.drain(this.breakCursor, (d, o) => {
      if (this.puffList.length >= 256) this.puffList.shift();
      const kind = d[o + 3];
      this.puffList.push({
        x: d[o],
        y: d[o + 1] + 0.5,
        z: d[o + 2],
        t: 0,
        color:
          kind === CHEST ? 0xffd54a : kind === SHRINE ? 0x7fe3ff : kind === TORCH_FX ? 0xff8a2a : 0xc8743f,
        size: kind === CHEST ? 1.6 : kind === SHRINE ? 2.6 : kind === TORCH_FX ? 1.3 : 0.9,
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
