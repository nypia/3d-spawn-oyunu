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
import { PICKUP_GOLD, PICKUP_HEAL, PICKUP_MAGNET } from '../sim/pickups/PickupPool';
import { CHEST, SHRINE, VASE } from '../sim/world/Interactables';
import type { World } from '../sim/world/World';
import {
  beamGeometry,
  chestGeometry,
  coinGeometry,
  healGeometry,
  magnetGeometry,
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
};

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

/** Vazolar, sandıklar, tapınaklar ve yerdeki altın/can/mıknatıs. */
export class PropsView {
  readonly root = new Group();
  private readonly vases: InstancedMesh;
  private readonly chests: InstancedMesh;
  private readonly shrines: InstancedMesh;
  private readonly coins: InstancedMesh;
  private readonly heals: InstancedMesh;
  private readonly magnets: InstancedMesh;
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
    this.coins = instanced(coinGeometry(), 400, false, 0x5a3d00);
    this.coins.material = new MeshLambertMaterial({ color: 0xffcf33, emissive: 0x6b4a00, flatShading: true });
    this.heals = instanced(healGeometry(), 64, false, 0x301008);
    this.magnets = instanced(magnetGeometry(), 32, false, 0x300000);
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
      this.coins,
      this.heals,
      this.magnets,
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

    const pk = world.pickups;
    let a = 0;
    let b = 0;
    let c = 0;
    let nb = 0;
    for (let i = 0; i < pk.count; i++) {
      if (pk.dead[i]) continue;
      const bob = pk.pull[i] > 0 ? 0 : Math.sin(time * 3 + i) * 0.08;
      pos.set(pk.x[i], pk.y[i] + bob, pk.z[i]);
      quat.setFromAxisAngle(UP, time * 3 + i);
      scl.setScalar(1);
      m4.compose(pos, quat, scl);
      switch (pk.kind[i]) {
        case PICKUP_GOLD:
          this.coins.setMatrixAt(a++, m4);
          break;
        case PICKUP_HEAL:
          this.heals.setMatrixAt(b++, m4);
          break;
        case PICKUP_MAGNET:
          this.magnets.setMatrixAt(c++, m4);
          break;
      }
      const beam = BEAM_COLORS[pk.kind[i]];
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
    this.coins.count = a;
    this.heals.count = b;
    this.magnets.count = c;
    this.beams.count = nb;
    for (const m of [this.coins, this.heals, this.magnets, this.beams]) m.instanceMatrix.needsUpdate = true;
    if (this.beams.instanceColor) this.beams.instanceColor.needsUpdate = true;
  }
}
