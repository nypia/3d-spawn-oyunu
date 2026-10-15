import {
  BufferAttribute,
  BufferGeometry,
  DodecahedronGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { BOSSES } from '../data/bosses';
import { HZ_BOULDER, HZ_LINE, HZF_VISUAL } from '../sim/combat/Hazards';
import type { Heightmap } from '../sim/terrain/Heightmap';
import type { World } from '../sim/world/World';

const MAX_VERTS = 14000;
const MAX_INDEX = MAX_VERTS * 3;
const SEG = 32;
const LIFT = 0.09;
const m4 = new Matrix4();
const pos = new Vector3();
const quat = new Quaternion();
const scl = new Vector3();
const AXIS = new Vector3(1, 0.6, 0.3).normalize();

/**
 * Boss saldırılarının yerdeki uyarıları: dolan kırmızı daireler, diken çizgileri, atılma yolları ve
 * havada kavis çizen kayalar; boss'ların altında dönen halka. Uyarılar araziye oturan tek bir dinamik
 * mesh'te (vertex başına renk + saydamlık) her kare yeniden kurulur.
 */
export class HazardView {
  readonly root = new Group();
  private readonly geo = new BufferGeometry();
  private readonly positions = new Float32Array(MAX_VERTS * 3);
  private readonly colors = new Float32Array(MAX_VERTS * 4);
  private readonly index = new Uint32Array(MAX_INDEX);
  private readonly rocks: InstancedMesh;
  private nv = 0;
  private ni = 0;

  constructor() {
    const p = new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage);
    const c = new BufferAttribute(this.colors, 4).setUsage(DynamicDrawUsage);
    this.geo.setAttribute('position', p);
    this.geo.setAttribute('color', c);
    this.geo.setIndex(new BufferAttribute(this.index, 1).setUsage(DynamicDrawUsage));
    const mesh = new Mesh(
      this.geo,
      new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide }),
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.rocks = new InstancedMesh(
      new DodecahedronGeometry(1, 0),
      new MeshLambertMaterial({ color: 0x8a7f72, flatShading: true }),
      48,
    );
    this.rocks.instanceMatrix.setUsage(DynamicDrawUsage);
    this.rocks.frustumCulled = false;
    this.rocks.count = 0;
    this.root.add(mesh, this.rocks);
  }

  private vert(x: number, y: number, z: number, r: number, g: number, b: number, a: number): number {
    const v = this.nv++;
    this.positions[v * 3] = x;
    this.positions[v * 3 + 1] = y;
    this.positions[v * 3 + 2] = z;
    this.colors[v * 4] = r;
    this.colors[v * 4 + 1] = g;
    this.colors[v * 4 + 2] = b;
    this.colors[v * 4 + 3] = a;
    return v;
  }

  private tri(a: number, b: number, c: number): void {
    this.index[this.ni++] = a;
    this.index[this.ni++] = b;
    this.index[this.ni++] = c;
  }

  /** Araziye oturan dolu daire (yelpaze). */
  private disc(
    t: Heightmap,
    x: number,
    z: number,
    r: number,
    cr: number,
    cg: number,
    cb: number,
    a: number,
  ): void {
    if (this.nv + SEG + 2 > MAX_VERTS || r <= 0.01) return;
    const c = this.vert(x, t.heightAt(x, z) + LIFT, z, cr, cg, cb, a);
    const first = this.nv;
    for (let k = 0; k < SEG; k++) {
      const ang = (k / SEG) * Math.PI * 2;
      const px = x + Math.sin(ang) * r;
      const pz = z + Math.cos(ang) * r;
      this.vert(px, t.heightAt(px, pz) + LIFT, pz, cr, cg, cb, a * 0.8);
    }
    for (let k = 0; k < SEG; k++) this.tri(c, first + k, first + ((k + 1) % SEG));
  }

  /** Araziye oturan halka. */
  private ring(
    t: Heightmap,
    x: number,
    z: number,
    r0: number,
    r1: number,
    cr: number,
    cg: number,
    cb: number,
    a: number,
    rot = 0,
  ): void {
    if (this.nv + SEG * 2 > MAX_VERTS) return;
    const first = this.nv;
    for (let k = 0; k < SEG; k++) {
      const ang = (k / SEG) * Math.PI * 2 + rot;
      const s = Math.sin(ang);
      const co = Math.cos(ang);
      const ix = x + s * r0;
      const iz = z + co * r0;
      const ox = x + s * r1;
      const oz = z + co * r1;
      this.vert(ix, t.heightAt(ix, iz) + LIFT, iz, cr, cg, cb, a);
      this.vert(ox, t.heightAt(ox, oz) + LIFT, oz, cr, cg, cb, a);
    }
    for (let k = 0; k < SEG; k++) {
      const a0 = first + k * 2;
      const b0 = first + ((k + 1) % SEG) * 2;
      this.tri(a0, a0 + 1, b0 + 1);
      this.tri(a0, b0 + 1, b0);
    }
  }

  /** Araziye oturan şerit: (x,z)'den (x2,z2)'ye, yarı genişlik w, `fill` kadarı dolu. */
  private strip(
    t: Heightmap,
    x: number,
    z: number,
    x2: number,
    z2: number,
    w: number,
    from: number,
    to: number,
    cr: number,
    cg: number,
    cb: number,
    a: number,
  ): void {
    const n = 14;
    if (this.nv + (n + 1) * 2 > MAX_VERTS || to <= from) return;
    const dx = x2 - x;
    const dz = z2 - z;
    const len = Math.hypot(dx, dz) || 1e-4;
    const nx = (-dz / len) * w;
    const nz = (dx / len) * w;
    const first = this.nv;
    for (let k = 0; k <= n; k++) {
      const u = from + ((to - from) * k) / n;
      const cx = x + dx * u;
      const cz = z + dz * u;
      this.vert(cx + nx, t.heightAt(cx + nx, cz + nz) + LIFT, cz + nz, cr, cg, cb, a);
      this.vert(cx - nx, t.heightAt(cx - nx, cz - nz) + LIFT, cz - nz, cr, cg, cb, a);
    }
    for (let k = 0; k < n; k++) {
      const a0 = first + k * 2;
      this.tri(a0, a0 + 1, a0 + 3);
      this.tri(a0, a0 + 3, a0 + 2);
    }
  }

  update(world: World, time: number): void {
    this.nv = 0;
    this.ni = 0;
    const t = world.terrain;
    const h = world.hazards;
    let nr = 0;
    const blink = 0.75 + Math.sin(time * 18) * 0.25;
    for (let i = 0; i < h.count; i++) {
      const u = 1 - h.delay[i] / h.total[i];
      const r = h.radius[i];
      const visual = h.flags[i] & HZF_VISUAL;
      // Son çeyrekte yanıp söner: "şimdi kaç".
      const a = u > 0.75 ? blink : 1;
      if (h.kind[i] === HZ_LINE) {
        if (visual) {
          this.strip(t, h.x[i], h.z[i], h.x2[i], h.z2[i], r, 0, 1, 1, 0.45, 0.08, 0.35 * a);
        } else {
          this.strip(t, h.x[i], h.z[i], h.x2[i], h.z2[i], r, 0, 1, 0.9, 0.04, 0.02, 0.3);
          this.strip(t, h.x[i], h.z[i], h.x2[i], h.z2[i], r * 0.85, 0, u, 1, 0.12, 0.04, 0.6 * a);
        }
        continue;
      }
      this.ring(t, h.x[i], h.z[i], r * 0.88, r, 1, 0.1, 0.04, 0.95 * a);
      this.disc(t, h.x[i], h.z[i], r, 0.9, 0.02, 0.02, 0.3);
      this.disc(t, h.x[i], h.z[i], r * u, 1, 0.08, 0.03, 0.62 * a);
      if (h.kind[i] === HZ_BOULDER && nr < this.rocks.instanceMatrix.count) {
        // Kaya (ya da damla) çıkış noktasından kavis çizerek hedefe düşer.
        const sx = h.x2[i];
        const sz = h.z2[i];
        const from = sx === h.x[i] && sz === h.z[i];
        const gx = sx + (h.x[i] - sx) * u;
        const gz = sz + (h.z[i] - sz) * u;
        const ground = t.heightAt(gx, gz);
        const y = from ? ground + (1 - u) * 14 : ground + 2.5 + Math.sin(u * Math.PI) * 7 - u * 2.5;
        pos.set(gx, y, gz);
        quat.setFromAxisAngle(AXIS, time * 6 + i);
        scl.setScalar(Math.max(0.4, r * 0.38));
        m4.compose(pos, quat, scl);
        this.rocks.setMatrixAt(nr++, m4);
      }
    }
    // Boss'ların altında dönen halka (kendi renginde).
    const e = world.enemies;
    for (const b of world.bosses.active) {
      for (let i = 0; i < e.count; i++) {
        if (e.uid[i] !== b.uid || e.dead[i]) continue;
        const c = BOSSES[b.index].color;
        const cr = ((c >> 16) & 255) / 255;
        const cg = ((c >> 8) & 255) / 255;
        const cb = (c & 255) / 255;
        const R = e.radius[i] * 1.9 + 0.6;
        this.ring(t, e.x[i], e.z[i], R * 0.86, R, cr, cg, cb, 0.55, time * 1.5);
        this.ring(t, e.x[i], e.z[i], R * 1.08, R * 1.12, 1, 0.2, 0.2, 0.35, -time);
      }
    }
    this.rocks.count = nr;
    this.rocks.instanceMatrix.needsUpdate = true;
    const g = this.geo;
    (g.getAttribute('position') as BufferAttribute).clearUpdateRanges();
    (g.getAttribute('position') as BufferAttribute).addUpdateRange(0, this.nv * 3);
    g.getAttribute('position').needsUpdate = true;
    (g.getAttribute('color') as BufferAttribute).clearUpdateRanges();
    (g.getAttribute('color') as BufferAttribute).addUpdateRange(0, this.nv * 4);
    g.getAttribute('color').needsUpdate = true;
    const idx = g.getIndex() as BufferAttribute;
    idx.clearUpdateRanges();
    idx.addUpdateRange(0, this.ni);
    idx.needsUpdate = true;
    g.setDrawRange(0, this.ni);
  }
}
