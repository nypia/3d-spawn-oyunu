import {
  AdditiveBlending,
  type BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  RingGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../core/Rng';
import { CHEST_BOSS, CHEST_PLAIN } from '../data/chests';
import { ALTAR as ALTAR_CFG, CAULDRON as CAULDRON_CFG } from '../data/landmarks';
import { EF_SPECIAL } from '../sim/enemies/EnemyPool';
import {
  PICKUP_BAG,
  PICKUP_CLOCK,
  PICKUP_GOLD,
  PICKUP_HEAL,
  PICKUP_MAGNET,
  PICKUP_ROSARY,
} from '../sim/pickups/PickupPool';
import { ALTAR, CAULDRON, CHEST, VASE } from '../sim/world/Interactables';
import type { World } from '../sim/world/World';
import type { GameAssets } from './assets/loadAssets';
import { texturedModel } from './assets/staticModels';
import {
  bagGeometry,
  beamGeometry,
  brazierGeometry,
  cauldronGeometry,
  clockGeometry,
  flameGeometry,
  healGeometry,
  liquidGeometry,
  magnetGeometry,
  rosaryGeometry,
} from './shapes';

const UP = new Vector3(0, 1, 0);
const m4 = new Matrix4();
const pos = new Vector3();
const quat = new Quaternion();
const scl = new Vector3();
const WHITE = new Color(1, 1, 1);
/** Ödül sandıkları türüne göre renk: düz, elit (altın), boss (kızıl-mor), kazan (zehir yeşili). */
const CHEST_TINTS = [
  new Color(1, 1, 1),
  new Color(1.6, 1.25, 0.45),
  new Color(1.9, 0.55, 1.2),
  new Color(0.7, 1.7, 0.6),
];
const ALTAR_USED = new Color(0.42, 0.4, 0.46);
const ALTAR_RING = new Color(1.3, 0.12, 1.6);
const SOUL_RING = new Color(0.35, 1.2, 0.5);
const SOUL_LOW = new Color(0.15, 0.55, 0.25);
const SOUL_FULL = new Color(0.6, 3.2, 1);
const SOUL_COLD = new Color(0.22, 0.2, 0.28);
const GOBLIN_BEAM = new Color(0xffc23a);
const tint = new Color();
const BEAM_CAP = 32;
/** Işık sütunu alan nadir pickup'lar ve renkleri. */
const BEAM_COLORS: Partial<Record<number, Color>> = {
  [PICKUP_MAGNET]: new Color(0xff3b3b),
  [PICKUP_CLOCK]: new Color(0x6fd8ff),
  [PICKUP_ROSARY]: new Color(0xfff0a0),
};
/** Pickup türü başına görsel boy. */
const PICKUP_SCALE: Partial<Record<number, number>> = { [PICKUP_CLOCK]: 1.25, [PICKUP_ROSARY]: 1.25 };

/** Lanet Sunaklarının çevresine serpilen mezar taşları (yalnızca dekor). */
const GRAVES = ['gravestone-round', 'gravestone-cross', 'gravestone-broken', 'gravestone-bevel'];

/** Dokulu Kenney modeli → ölçeklenmiş instanced mesh (kendi colormap materyaliyle). */
function instancedModel(assets: GameAssets, key: string, scale: number, cap: number, shadows: boolean) {
  const { geometry, material } = texturedModel(assets.model(key));
  geometry.scale(scale, scale, scale);
  const m = new InstancedMesh(geometry, material, cap);
  m.instanceMatrix.setUsage(DynamicDrawUsage);
  m.count = 0;
  m.frustumCulled = false;
  m.castShadow = shadows;
  m.receiveShadow = shadows;
  return m;
}

/** Lanet Sunağı: taş sunak, üstünde ve iki yanında mum öbekleri. */
function altarModel(assets: GameAssets): BufferGeometry {
  const stone = texturedModel(assets.model('graveyard/altar-stone')).geometry.scale(2.4, 2.4, 2.4);
  stone.computeBoundingBox();
  const top = stone.boundingBox?.max.y ?? 0.5;
  const candle = (x: number, y: number, z: number, s: number) =>
    texturedModel(assets.model('graveyard/candle-multiple')).geometry.scale(s, s, s).translate(x, y, z);
  const g = mergeGeometries([
    stone,
    candle(0, top, 0, 1.4),
    candle(-1.25, 0, 0.5, 2),
    candle(1.25, 0, -0.4, 2),
  ]);
  if (!g) throw new Error('sunak modeli');
  return g;
}

function instanced(geo: BufferGeometry, cap: number, shadows: boolean, emissive = 0x000000) {
  const m = new InstancedMesh(
    geo,
    new MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive }),
    cap,
  );
  m.instanceMatrix.setUsage(DynamicDrawUsage);
  m.count = 0;
  m.frustumCulled = false;
  m.castShadow = shadows;
  m.receiveShadow = shadows;
  return m;
}

/** Vazolar, sandıklar, Lanet Sunakları, Ruh Kazanları, meşaleler ve yerdeki pickup'lar. */
export class PropsView {
  readonly root = new Group();
  private readonly vases: InstancedMesh;
  private readonly chests: InstancedMesh;
  private readonly altars: InstancedMesh;
  private readonly cauldrons: InstancedMesh;
  /** Kazan sıvısı: dolumla yükselir, dolarken parlar. */
  private readonly liquids: InstancedMesh;
  private readonly graves: InstancedMesh[];
  private readonly braziers: InstancedMesh;
  private readonly flames: InstancedMesh;
  /** PICKUP_* türü → mesh. */
  private readonly pickupMeshes: InstancedMesh[] = [];
  private readonly pickupCounts: number[] = [];
  /** Nadir pickup'ların üstündeki ışık sütunları (uzaktan görünsün). */
  private readonly beams: InstancedMesh;
  /** Yerdeki alan halkaları (kazanın ruh alanı, sunak). */
  private readonly rings: InstancedMesh;

  constructor(shadows: boolean, assets: GameAssets) {
    // Kenney modelleri (dokulu kitler): çömlek = vazo, sandık, sunak taşı + mumlar = Lanet Sunağı.
    this.vases = instancedModel(assets, 'dungeon/pot', 1.8, 128, shadows);
    this.chests = instancedModel(assets, 'dungeon/chest', 2.2, 48, shadows);
    this.chests.setColorAt(0, WHITE);
    this.altars = new InstancedMesh(
      altarModel(assets),
      texturedModel(assets.model('graveyard/altar-stone')).material,
      16,
    );
    this.altars.instanceMatrix.setUsage(DynamicDrawUsage);
    this.altars.castShadow = shadows;
    this.altars.frustumCulled = false;
    this.altars.setColorAt(0, WHITE);
    this.cauldrons = instanced(cauldronGeometry(), 16, shadows);
    (this.cauldrons.material as MeshLambertMaterial).side = DoubleSide;
    this.liquids = new InstancedMesh(liquidGeometry(), new MeshBasicMaterial({ color: 0xffffff }), 16);
    this.liquids.setColorAt(0, WHITE);
    this.graves = GRAVES.map((k) => instancedModel(assets, `graveyard/${k}`, 2, 64, shadows));
    this.braziers = instanced(brazierGeometry(), 16, shadows);
    this.flames = instanced(flameGeometry(), 16, false);
    // Alev HDR parlar (bloom); düşük kalitede parıltı kartı Effects'te.
    this.flames.material = new MeshBasicMaterial({ vertexColors: true, color: new Color(2.2, 2.2, 2.2) });
    const coins = instancedModel(assets, 'dungeon/coin', 0.75, 400, false);
    const coinMat = (coins.material as MeshLambertMaterial).clone();
    coinMat.emissive.setHex(0x5a3c00);
    coins.material = coinMat;
    this.pickupMeshes[PICKUP_GOLD] = coins;
    this.pickupMeshes[PICKUP_HEAL] = instanced(healGeometry(), 64, false, 0x301008);
    this.pickupMeshes[PICKUP_MAGNET] = instanced(magnetGeometry(), 32, false, 0x300000);
    this.pickupMeshes[PICKUP_BAG] = instanced(bagGeometry(), 64, false, 0x2a1800);
    this.pickupMeshes[PICKUP_CLOCK] = instanced(clockGeometry(), 16, false, 0x302400);
    this.pickupMeshes[PICKUP_ROSARY] = instanced(rosaryGeometry(), 16, false, 0x40381a);
    this.beams = new InstancedMesh(
      beamGeometry(),
      new MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.42,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
      BEAM_CAP,
    );
    this.beams.setColorAt(0, WHITE);
    this.rings = new InstancedMesh(
      new RingGeometry(0.96, 1, 64).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }),
      16,
    );
    this.rings.setColorAt(0, WHITE);
    for (const m of [this.rings, this.beams, this.liquids]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
    }
    this.root.add(
      this.vases,
      this.chests,
      this.altars,
      this.cauldrons,
      this.liquids,
      ...this.graves,
      this.braziers,
      this.flames,
      ...this.pickupMeshes,
      this.beams,
      this.rings,
    );
  }

  /** Yeni dünya: sunakların çevresine mezar taşları (seed'li, sabit). */
  setWorld(world: World): void {
    const rng = new Rng(world.seed ^ 0x6a7e);
    const counts = this.graves.map(() => 0);
    const it = world.interactables;
    for (let i = 0; i < it.count; i++) {
      if (it.kind[i] !== ALTAR) continue;
      const n = rng.int(4, 6);
      for (let k = 0; k < n; k++) {
        const a = rng.range(0, Math.PI * 2);
        const r = ALTAR_CFG.radius + rng.range(1.2, 2.6);
        const x = it.x[i] + Math.sin(a) * r;
        const z = it.z[i] + Math.cos(a) * r;
        const v = rng.int(0, this.graves.length - 1);
        const mesh = this.graves[v];
        if (counts[v] >= mesh.instanceMatrix.count) continue;
        pos.set(x, world.terrain.heightAt(x, z) - 0.05, z);
        // Mezar taşları sunağa dönük, hafif eğri.
        quat.setFromAxisAngle(UP, Math.atan2(it.x[i] - x, it.z[i] - z) + rng.range(-0.3, 0.3));
        scl.setScalar(rng.range(0.85, 1.15));
        m4.compose(pos, quat, scl);
        mesh.setMatrixAt(counts[v]++, m4);
      }
    }
    this.graves.forEach((m, v) => {
      m.count = counts[v];
      m.instanceMatrix.needsUpdate = true;
    });
  }

  update(world: World, time: number): void {
    const it = world.interactables;
    let nv = 0;
    let nc = 0;
    let na = 0;
    let nk = 0;
    let nr = 0;
    const ring = (x: number, y: number, z: number, r: number, c: Color) => {
      quat.identity();
      pos.set(x, y + 0.06, z);
      scl.setScalar(r);
      m4.compose(pos, quat, scl);
      this.rings.setMatrixAt(nr, m4);
      this.rings.setColorAt(nr++, c);
    };
    for (let i = 0; i < it.count; i++) {
      const kind = it.kind[i];
      if (it.used[i] && kind !== ALTAR) continue;
      const y = world.terrain.heightAt(it.x[i], it.z[i]);
      pos.set(it.x[i], y - 0.05, it.z[i]);
      quat.setFromAxisAngle(UP, it.rotation[i]);
      scl.setScalar(1);
      if (kind === VASE) {
        m4.compose(pos, quat, scl);
        this.vases.setMatrixAt(nv++, m4);
      } else if (kind === CHEST) {
        // Kapalı sandık hafifçe zıplar, dikkat çeksin.
        pos.y += Math.abs(Math.sin(time * 2 + i)) * 0.08;
        const tier = it.free[i] ? it.tier[i] : CHEST_PLAIN;
        if (tier === CHEST_BOSS) scl.setScalar(1.5);
        m4.compose(pos, quat, scl);
        this.chests.setMatrixAt(nc, m4);
        this.chests.setColorAt(nc, CHEST_TINTS[tier] ?? WHITE);
        nc++;
      } else if (kind === ALTAR) {
        m4.compose(pos, quat, scl);
        this.altars.setMatrixAt(na, m4);
        this.altars.setColorAt(na++, it.used[i] ? ALTAR_USED : WHITE);
        if (!it.used[i]) {
          const pulse = 1 + Math.sin(time * 3 + i) * 0.04;
          ring(it.x[i], y, it.z[i], ALTAR_CFG.radius * pulse, ALTAR_RING);
        }
      } else if (kind === CAULDRON) {
        m4.compose(pos, quat, scl);
        this.cauldrons.setMatrixAt(nk, m4);
        // Sıvı dolumla yükselir; soğurken kararır, dolmaya yakın parlar.
        const cold = it.cooldown[i] > 0;
        const fill = cold ? 0 : Math.min(1, it.charge[i]);
        quat.identity();
        pos.set(it.x[i], y + 0.72 + fill * 0.58, it.z[i]);
        scl.set(0.62 + fill * 0.26, 1, 0.62 + fill * 0.26);
        m4.compose(pos, quat, scl);
        this.liquids.setMatrixAt(nk, m4);
        if (cold) tint.copy(SOUL_COLD);
        else
          tint
            .copy(SOUL_LOW)
            .lerp(SOUL_FULL, fill)
            .multiplyScalar(1 + Math.sin(time * 5 + i) * 0.08 * fill);
        this.liquids.setColorAt(nk++, tint);
        if (!cold) ring(it.x[i], y, it.z[i], CAULDRON_CFG.radius, SOUL_RING);
      }
    }
    this.vases.count = nv;
    this.chests.count = nc;
    this.altars.count = na;
    this.cauldrons.count = nk;
    this.liquids.count = nk;
    this.rings.count = nr;
    for (const m of [this.vases, this.chests, this.altars, this.cauldrons, this.liquids, this.rings]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    this.updateTorches(world, time);

    const pk = world.pickups;
    const counts = this.pickupCounts;
    for (let k = 0; k < this.pickupMeshes.length; k++) counts[k] = 0;
    let nb = 0;
    for (let i = 0; i < pk.count; i++) {
      if (pk.dead[i]) continue;
      const kind = pk.kind[i];
      const mesh = this.pickupMeshes[kind];
      if (!mesh || counts[kind] >= mesh.instanceMatrix.count) continue;
      const bob = pk.pull[i] > 0 ? 0 : Math.sin(time * 3 + i) * 0.08;
      pos.set(pk.x[i], pk.y[i] + bob, pk.z[i]);
      quat.setFromAxisAngle(UP, time * 3 + i);
      scl.setScalar(PICKUP_SCALE[kind] ?? 1);
      m4.compose(pos, quat, scl);
      mesh.setMatrixAt(counts[kind]++, m4);
      const beam = BEAM_COLORS[kind];
      if (beam && pk.pull[i] === 0 && nb < BEAM_CAP) {
        const w = 1 + Math.sin(time * 4 + i) * 0.15;
        pos.y = pk.y[i] - 0.3;
        quat.identity();
        scl.set(w, 1, w);
        m4.compose(pos, quat, scl);
        this.beams.setMatrixAt(nb, m4);
        this.beams.setColorAt(nb, beam);
        nb++;
      }
    }
    // Hazine Goblininin üstünde altın ışık sütunu: uzaktan görünsün.
    const e = world.enemies;
    for (let i = 0; i < e.count && nb < BEAM_CAP; i++) {
      if (e.dead[i] || !(e.flags[i] & EF_SPECIAL)) continue;
      const w = 1.4 + Math.sin(time * 5) * 0.2;
      pos.set(e.x[i], e.y[i] + 1.2, e.z[i]);
      quat.identity();
      scl.set(w, 1.6, w);
      m4.compose(pos, quat, scl);
      this.beams.setMatrixAt(nb, m4);
      this.beams.setColorAt(nb++, GOBLIN_BEAM);
    }
    this.pickupMeshes.forEach((m, k) => {
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
    });
    this.beams.count = nb;
    this.beams.instanceMatrix.needsUpdate = true;
    if (this.beams.instanceColor) this.beams.instanceColor.needsUpdate = true;
  }

  /** Meşaleler: mangal + titreyen alev. */
  private updateTorches(world: World, time: number): void {
    const t = world.torches;
    for (let i = 0; i < t.count; i++) {
      const y = world.terrain.heightAt(t.x[i], t.z[i]);
      pos.set(t.x[i], y - 0.02, t.z[i]);
      quat.setFromAxisAngle(UP, t.phase[i]);
      scl.setScalar(1);
      m4.compose(pos, quat, scl);
      this.braziers.setMatrixAt(i, m4);
      const ph = t.phase[i] * 7;
      const f = 1 + Math.sin(time * 13 + ph) * 0.12 + Math.sin(time * 7.3 + ph * 1.7) * 0.08;
      pos.y = y + 1.22;
      quat.setFromAxisAngle(UP, time * 2 + ph);
      scl.set(1.1 - (f - 1) * 0.5, f, 1.1 - (f - 1) * 0.5);
      m4.compose(pos, quat, scl);
      this.flames.setMatrixAt(i, m4);
    }
    for (const m of [this.braziers, this.flames]) {
      m.count = t.count;
      m.instanceMatrix.needsUpdate = true;
    }
  }
}
