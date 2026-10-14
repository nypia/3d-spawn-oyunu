import {
  CanvasTexture,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import type { Heightmap } from '../sim/terrain/Heightmap';

const UP = new Vector3(0, 1, 0);
const m4 = new Matrix4();
const pos = new Vector3();
const quat = new Quaternion();
const scl = new Vector3();
const normal = new Float32Array(3);
const nrm = new Vector3();

let shared: CanvasTexture | null = null;

/** Yumuşak kenarlı yuvarlak gölge dokusu (tek örnek, paylaşılır). */
export function radialShadowTexture(): CanvasTexture {
  if (shared) return shared;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.85)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.45)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  shared = new CanvasTexture(c);
  return shared;
}

/**
 * Yuvarlak "blob" gölgeler: animasyonlu kalabalıkta gerçek gölge pahalı. Tek draw call, zemine eğimle
 * oturur; uçanlar yükseldikçe gölge küçülüp soluklaşır.
 */
export class BlobShadows {
  readonly mesh: InstancedMesh;
  private n = 0;

  constructor(capacity: number) {
    const mat = new MeshBasicMaterial({
      map: radialShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.mesh.count = 0;
  }

  begin(): void {
    this.n = 0;
  }

  /** (x,z) noktasına r yarıçaplı gölge; `lift` nesnenin yerden yüksekliği (m). */
  add(terrain: Heightmap, x: number, z: number, r: number, lift = 0): void {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    terrain.normalAt(x, z, normal);
    nrm.set(normal[0], normal[1], normal[2]);
    quat.setFromUnitVectors(UP, nrm);
    pos.set(x, terrain.heightAt(x, z) + 0.04, z);
    const d = 2 * r * Math.max(0.35, 1 - lift * 0.18);
    scl.set(d, 1, d);
    m4.compose(pos, quat, scl);
    this.mesh.setMatrixAt(this.n++, m4);
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
