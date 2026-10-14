import {
  AdditiveBlending,
  type BufferGeometry,
  CircleGeometry,
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
import { SHRINE as SHRINE_CFG } from '../data/shrines';
import {
  PICKUP_BAG,
  PICKUP_CLOCK,
  PICKUP_GOLD,
  PICKUP_HEAL,
  PICKUP_MAGNET,
  PICKUP_ROSARY,
} from '../sim/pickups/PickupPool';
import { CHEST, SHRINE, VASE } from '../sim/world/Interactables';
import type { World } from '../sim/world/World';
import {
  bagGeometry,
  beamGeometry,
  brazierGeometry,
  chestGeometry,
  clockGeometry,
  coinGeometry,
  flameGeometry,
  healGeometry,
  magnetGeometry,
  rosaryGeometry,
  shrineGeometry,
  vaseGeometry,
} from './shapes';

const UP = new Vector3(0, 1, 0);
const m4 = new Matrix4();
const pos = new Vector3();
const quat = new Quaternion();
const scl = new Vector3();
const WHITE = new Color(1, 1, 1);
const CHEST_WOOD = new Color(0x8a5a33);
const CHEST_GOLD = new Color(1.6, 1.25, 0.45);
const SHRINE_USED = new Color(0.45, 0.45, 0.5);
const SHRINE_GLOW = new Color(0x7fe3ff);
const BEAM_CAP = 32;
/** Işık sütunu alan nadir pickup'lar ve renkleri. */
const BEAM_COLORS: Partial<Record<number, Color>> = {
  [PICKUP_MAGNET]: new Color(0xff3b3b),
  [PICKUP_CLOCK]: new Color(0x6fd8ff),
  [PICKUP_ROSARY]: new Color(0xfff0a0),
};
/** Pickup türü başına görsel boy. */
const PICKUP_SCALE: Partial<Record<number, number>> = { [PICKUP_CLOCK]: 1.25, [PICKUP_ROSARY]: 1.25 };

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

/** Vazolar, sandıklar, tapınaklar, meşaleler ve yerdeki pickup'lar. */
export class PropsView {
  readonly root = new Group();
  private readonly vases: InstancedMesh;
  private readonly chests: InstancedMesh;
  private readonly shrines: InstancedMesh;
  private readonly braziers: InstancedMesh;
  private readonly flames: InstancedMesh;
  /** PICKUP_* türü → mesh. */
  private readonly pickupMeshes: InstancedMesh[] = [];
  private readonly pickupCounts: number[] = [];
  /** Nadir pickup'ların üstündeki ışık sütunları (uzaktan görünsün). */
  private readonly beams: InstancedMesh;
  /** Tapınak alanı halkası ve dolum diski. */
  private readonly shrineRings: InstancedMesh;
  private readonly shrineFills: InstancedMesh;

  constructor(shadows: boolean) {
    this.vases = instanced(vaseGeometry(), 128, shadows);
    this.chests = instanced(chestGeometry(), 48, shadows);
    this.chests.setColorAt(0, WHITE);
    this.shrines = instanced(shrineGeometry(), 16, shadows);
    this.shrines.setColorAt(0, WHITE);
    this.braziers = instanced(brazierGeometry(), 16, shadows);
    this.flames = instanced(flameGeometry(), 16, false);
    this.flames.material = new MeshBasicMaterial({ vertexColors: true });
    const coins = instanced(coinGeometry(), 400, false);
    coins.material = new MeshLambertMaterial({ color: 0xffcf33, emissive: 0x6b4a00, flatShading: true });
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
    const flat = { color: 0x7fe3ff, transparent: true, depthWrite: false };
    this.shrineRings = new InstancedMesh(
      new RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ ...flat, opacity: 0.75 }),
      16,
    );
    this.shrineFills = new InstancedMesh(
      new CircleGeometry(1, 40).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ ...flat, opacity: 0.22 }),
      16,
    );
    for (const m of [this.shrineRings, this.shrineFills, this.beams]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
    }
    this.root.add(
      this.vases,
      this.chests,
      this.shrines,
      this.braziers,
      this.flames,
      ...this.pickupMeshes,
      this.beams,
      this.shrineRings,
      this.shrineFills,
    );
  }

  update(world: World, time: number): void {
    const it = world.interactables;
    let nv = 0;
    let nc = 0;
    let ns = 0;
    let nr = 0;
    for (let i = 0; i < it.count; i++) {
      const kind = it.kind[i];
      if (it.used[i] && kind !== SHRINE) continue;
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
        m4.compose(pos, quat, scl);
        this.chests.setMatrixAt(nc, m4);
        this.chests.setColorAt(nc, it.free[i] ? CHEST_GOLD : CHEST_WOOD);
        nc++;
      } else if (kind === SHRINE) {
        m4.compose(pos, quat, scl);
        this.shrines.setMatrixAt(ns, m4);
        this.shrines.setColorAt(ns, it.used[i] ? SHRINE_USED : SHRINE_GLOW);
        ns++;
        if (!it.used[i]) {
          // Alan halkası (hafif nabız) + dolum diski.
          quat.identity();
          pos.y = y + 0.08;
          scl.setScalar(SHRINE_CFG.radius * (1 + Math.sin(time * 3) * 0.02));
          m4.compose(pos, quat, scl);
          this.shrineRings.setMatrixAt(nr, m4);
          scl.setScalar(Math.max(0.001, SHRINE_CFG.radius * it.charge[i]));
          m4.compose(pos, quat, scl);
          this.shrineFills.setMatrixAt(nr, m4);
          nr++;
        }
      }
    }
    this.vases.count = nv;
    this.chests.count = nc;
    this.shrines.count = ns;
    this.shrineRings.count = nr;
    this.shrineFills.count = nr;
    this.shrineRings.instanceMatrix.needsUpdate = true;
    this.shrineFills.instanceMatrix.needsUpdate = true;
    for (const m of [this.vases, this.chests, this.shrines]) {
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
