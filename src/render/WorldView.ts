import {
  AdditiveBlending,
  type BufferGeometry,
  CircleGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
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
import { ENEMIES, EXPLODER, SHOT_ORB } from '../data/enemies';
import { GEM_TIERS, gemTier } from '../data/gems';
import { ST_ACT, ST_WINDUP } from '../sim/enemies/EnemyPool';
import { OBSTACLE_TREE } from '../sim/world/Obstacles';
import type { World } from '../sim/world/World';
import type { GameAssets } from './assets/loadAssets';
import { coloredGeometry, NATURE_PALETTE, size } from './assets/staticModels';
import { BlobShadows } from './BlobShadows';
import { CulledInstances } from './CulledInstances';
import { buildEnemyLooks, type EnemyLook } from './crowd/enemyLooks';
import { arrowGeometry, gemGeometry } from './shapes';
import { createTerrainMesh } from './TerrainView';

const UP = new Vector3(0, 1, 0);
const m4 = new Matrix4();
const pos = new Vector3();
const quat = new Quaternion();
const scl = new Vector3();
const col = new Color();
const WHITE = new Color(1, 1, 1);
/** Elitler altın tonda parlar. */
const ELITE_TINT = new Color(1.55, 1.3, 0.6);
const FUSE_FLASH = new Color(3, 2.2, 1.2);
/** Donmuş düşman: buz mavisi. */
const ICE_TINT = new Color(0.6, 0.9, 1.35);
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

/**
 * XP taşı: yüzeyli Lambert + kendi renginde (instance rengi) HDR ışıma, bloom'da parlar.
 */
function glowingGemMaterial(): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      #ifdef USE_COLOR
        totalEmissiveRadiance += vColor.rgb * 1.1;
      #endif`,
    );
  };
  m.customProgramCacheKey = () => 'gem-glow';
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

/** Statik dekor modeli: birleşik geometri ve ham boyutu. */
interface DecorKind {
  geometry: BufferGeometry;
  width: number;
  height: number;
}

const TREE_MODELS = [
  'tree_oak',
  'tree_default',
  'tree_fat',
  'tree_plateau',
  'tree_small',
  'tree_pineRoundA',
  'tree_pineRoundC',
  'tree_pineTallA_detailed',
  'tree_cone',
];
const ROCK_MODELS = ['rock_largeA', 'rock_largeB', 'rock_largeC', 'rock_largeD', 'rock_tallA', 'rock_tallB'];

/** Sim engel indeksinden deterministik varyant seçimi. */
function variant(i: number, n: number): number {
  return Math.abs(Math.imul(i + 1, 2654435761) >> 7) % n;
}

const CORPSE_LIFE = 1.1;
const CORPSE_CAP = 64;

/**
 * Sim durumunu her karede instanced mesh'lere yansıtır. Tür başına tek draw call.
 * Düşman animasyonları (zıplama, sallanma, kanat çırpma) instance matrisiyle prosedüreldir.
 */
export class WorldView {
  readonly root = new Group();
  private terrain: Mesh | null = null;
  /** Ağaç ve kaya varyantları (Kenney nature-kit), her biri tek draw call. */
  private decor: CulledInstances[] = [];
  private readonly treeKinds: DecorKind[];
  private readonly rockKinds: DecorKind[];
  private readonly decorMaterial = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  /** Tür başına animasyonlu kalabalık (CrowdMesh). */
  private readonly looks: (EnemyLook | null)[];
  private readonly lookCounts: number[];
  private readonly corpses: Corpse[] = [];
  private readonly blobs: BlobShadows;
  private readonly gems: InstancedMesh;
  private readonly arrows: InstancedMesh;
  /** Bekçi küreleri: parlak çekirdek + saydam hale. */
  private readonly orbs: InstancedMesh;
  private readonly orbHalos: InstancedMesh;
  private readonly aura: Group;
  private readonly auraRing: Mesh;
  private readonly auraDisc: Mesh;
  private deathCursor = 0;

  constructor(
    enemyCapacity: number,
    private readonly shadows: boolean,
    assets: GameAssets,
  ) {
    const decorKind = (k: string): DecorKind => {
      const geometry = coloredGeometry(assets.model(`nature/${k}`), {
        ...NATURE_PALETTE,
        _defaultMat: 0x9a958c,
      });
      const [w, h, d] = size(geometry);
      return { geometry, width: Math.max(w, d), height: h };
    };
    this.treeKinds = TREE_MODELS.map(decorKind);
    this.rockKinds = ROCK_MODELS.map(decorKind);
    this.looks = buildEnemyLooks(assets, enemyCapacity + CORPSE_CAP);
    this.lookCounts = this.looks.map(() => 0);
    for (const look of this.looks) {
      if (!look) continue;
      look.crowd.setColorAt(0, WHITE);
      this.root.add(look.crowd);
    }
    this.blobs = new BlobShadows(enemyCapacity + CORPSE_CAP);
    this.root.add(this.blobs.mesh);

    this.gems = instanced(gemGeometry(), glowingGemMaterial(), BALANCE.xp.gemCapacity, false);
    this.gems.setColorAt(0, WHITE);

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
    this.orbs = instanced(
      new IcosahedronGeometry(0.32, 1),
      new MeshBasicMaterial({ color: new Color(1.9, 0.75, 3.2) }),
      256,
      false,
    );
    this.orbHalos = instanced(
      new IcosahedronGeometry(0.62, 2),
      new MeshBasicMaterial({
        color: 0x9a40ff,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
      256,
      false,
    );
    this.root.add(this.gems, this.aura, this.arrows, this.orbs, this.orbHalos);
  }

  /** Yeni run: araziyi ve statik dekoru yeniden kur. */
  setWorld(world: World): void {
    if (this.terrain) {
      this.root.remove(this.terrain);
      this.terrain.geometry.dispose();
    }
    for (const c of this.decor) {
      this.root.remove(c.mesh);
      c.mesh.dispose();
    }
    this.terrain = createTerrainMesh(world.terrain);
    this.root.add(this.terrain);

    // Ağaçlar ve kayalar: sim engel konum/boyu aynı, görünüm Kenney varyantı.
    const o = world.obstacles;
    const buckets = [...this.treeKinds, ...this.rockKinds].map(() => [] as number[]);
    for (let i = 0; i < o.count; i++) {
      const tree = o.kind[i] === OBSTACLE_TREE;
      const k = tree
        ? variant(i, this.treeKinds.length)
        : this.treeKinds.length + variant(i, this.rockKinds.length);
      buckets[k].push(i);
    }
    this.decor = buckets.map((idx, k) => {
      const tree = k < this.treeKinds.length;
      const kind = tree ? this.treeKinds[k] : this.rockKinds[k - this.treeKinds.length];
      const mesh = new InstancedMesh(kind.geometry, this.decorMaterial, Math.max(1, idx.length));
      // Sis ~165 m'de her şeyi örtüyor: daha uzağı çizme (gölge geçişi dahil).
      const culled = new CulledInstances(mesh, 175);
      for (const i of idx) {
        const s = o.scale[i];
        // Ağaç boyu sim ölçeğiyle büyür; kayanın genişliği çarpışma çapına eşit.
        const f = tree ? (4.4 * s) / kind.height : (2 * o.radius[i] * 1.05) / kind.width;
        pos.set(o.x[i], world.terrain.heightAt(o.x[i], o.z[i]) - 0.08, o.z[i]);
        quat.setFromAxisAngle(UP, o.rotation[i]);
        scl.set(f, tree ? f : f * (0.85 + (i % 5) * 0.08), f);
        m4.compose(pos, quat, scl);
        culled.add(m4);
      }
      mesh.castShadow = this.shadows;
      mesh.receiveShadow = this.shadows;
      this.root.add(mesh);
      return culled;
    });
    this.corpses.length = 0;
    this.deathCursor = world.deathFx.written;
  }

  update(world: World, time: number, dt: number): void {
    for (const c of this.decor) c.cull(world.player.x, world.player.z);
    this.updateEnemies(world, time, dt);
    this.updateGems(world, time);
    this.updateArrows(world, time);
    this.updateDeaths(world);

    const p = world.player;
    this.aura.visible = world.auraRadius > 0;
    if (this.aura.visible) {
      this.aura.position.set(p.x, world.terrain.heightAt(p.x, p.z) + 0.08, p.z);
      const pulse = 1 + Math.sin(time * 6) * 0.03;
      this.aura.scale.setScalar(world.auraRadius * pulse);
      // Cehennem Halesi (evrim) kendi renginde.
      const tint = world.tintOf('aura');
      (this.auraDisc.material as MeshBasicMaterial).color.setHex(tint || 0xff7a2a);
      (this.auraRing.material as MeshBasicMaterial).color.setHex(tint || 0xffb04a).multiplyScalar(2);
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
    // Hayalet hafifçe aşağı yukarı süzülür.
    const bob = def.behavior === 'phase' ? Math.sin(time * 2.6 + e.phase[i]) * 0.12 : 0;
    pos.set(e.x[i], e.y[i] + e.hover[i] + bob, e.z[i]);
    const p = world.player;
    const windup = !!def.dash && e.state[i] === ST_WINDUP;
    const yaw =
      def.behavior === 'ranged' || windup
        ? Math.atan2(p.x - e.x[i], p.z - e.z[i])
        : Math.atan2(e.vx[i], e.vz[i]);
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
    // Okçu/bekçi atıştan hemen önce yayı çeker ya da küreyi kaldırır; vampir çömelip atılır; diğerleri
    // yürüdükleri yol kadar adım atar.
    const draw = def.ranged?.castTime ?? 0.6;
    if (look.fuse && fusing) {
      crowd.setAnim(k, look.fuse, EXPLODER.fuse - e.timer[i], flash);
    } else if (look.windup && windup && def.dash) {
      const f = 1 - e.timer[i] / def.dash.windup;
      crowd.setAnim(k, look.windup, f * look.windup.duration, flash);
    } else if (look.dash && def.dash && e.state[i] === ST_ACT) {
      crowd.setAnim(k, look.dash, time * 1.6, flash);
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

  private updateArrows(world: World, time: number): void {
    const s = world.enemyShots;
    let k = 0;
    let o = 0;
    for (let j = 0; j < s.count; j++) {
      if (s.dead[j]) continue;
      if (s.kind[j] === SHOT_ORB) {
        // Küre: nabız gibi atan çekirdek, dönen hale; son yarım saniyede söner.
        const fade = Math.min(1, s.life[j] / 0.5);
        const pulse = (1 + Math.sin(time * 14 + j) * 0.12) * fade;
        pos.set(s.x[j], s.y[j], s.z[j]);
        quat.setFromAxisAngle(UP, time * 3 + j);
        scl.setScalar(pulse);
        m4.compose(pos, quat, scl);
        this.orbs.setMatrixAt(o, m4);
        scl.setScalar(pulse * (1.1 + Math.sin(time * 9 + j * 2) * 0.15));
        m4.compose(pos, quat, scl);
        this.orbHalos.setMatrixAt(o++, m4);
        continue;
      }
      arrowDir.set(s.vx[j], s.vy[j], s.vz[j]).normalize();
      quat.setFromUnitVectors(ARROW_FWD, arrowDir);
      pos.set(s.x[j], s.y[j], s.z[j]);
      scl.setScalar(1.2);
      m4.compose(pos, quat, scl);
      this.arrows.setMatrixAt(k++, m4);
    }
    this.arrows.count = k;
    this.arrows.instanceMatrix.needsUpdate = true;
    this.orbs.count = o;
    this.orbs.instanceMatrix.needsUpdate = true;
    this.orbHalos.count = o;
    this.orbHalos.instanceMatrix.needsUpdate = true;
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

  /** Ölen düşmanlar ceset olur (parçacıklar Effects'te). */
  private updateDeaths(world: World): void {
    this.deathCursor = world.deathFx.drain(this.deathCursor, (d, o) => {
      const type = d[o + 3];
      if (!this.looks[type]) return;
      if (this.corpses.length >= CORPSE_CAP) this.corpses.shift();
      const p = world.player;
      const yaw = ENEMIES[type].behavior === 'ranged' ? Math.atan2(p.x - d[o], p.z - d[o + 2]) : d[o + 4];
      this.corpses.push({ type, x: d[o], y: d[o + 1], z: d[o + 2], yaw, scale: d[o + 5], t: 0 });
    });
  }
}
