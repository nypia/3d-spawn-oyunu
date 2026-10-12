import { BufferAttribute, BufferGeometry, Color, Mesh, MeshLambertMaterial } from 'three';
import type { Heightmap } from '../sim/terrain/Heightmap';

const GRASS_LOW = new Color(0x3f7d3a);
const GRASS = new Color(0x5ea24a);
const GRASS_HIGH = new Color(0x9cbf5a);
const DIRT = new Color(0x8a6a45);
const ROCK = new Color(0x7d7a73);

/**
 * Yükseklik haritasından mesh üretir. Üçgenleme Heightmap.heightAt ile birebir aynıdır.
 * Renk: yükseklik ve eğime göre (düz alan çimen, yamaç toprak, dik duvar kaya).
 */
export function createTerrainMesh(hm: Heightmap): Mesh {
  const n = hm.verts;
  const pos = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  const normal = [0, 0, 0];
  const c = new Color();

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const x = -hm.half + i * hm.cell;
      const z = -hm.half + j * hm.cell;
      const h = hm.heights[k];
      pos[k * 3] = x;
      pos[k * 3 + 1] = h;
      pos[k * 3 + 2] = z;

      hm.normalAt(x, z, normal);
      const slope = 1 - normal[1];
      const t = Math.min(1, Math.max(0, (h + 4) / 14));
      if (t < 0.5) c.lerpColors(GRASS_LOW, GRASS, t * 2);
      else c.lerpColors(GRASS, GRASS_HIGH, (t - 0.5) * 2);
      if (slope > 0.12) c.lerp(DIRT, Math.min(1, (slope - 0.12) * 5));
      if (slope > 0.35) c.lerp(ROCK, Math.min(1, (slope - 0.35) * 4));
      // Low-poly çeşitlilik için hafif titreşim (deterministik).
      const jitter = (Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1;
      c.multiplyScalar(0.94 + Math.abs(jitter) * 0.1);
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
    }
  }

  const cells = n - 1;
  const idx = new Uint32Array(cells * cells * 6);
  let p = 0;
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const a = j * n + i; // (i, j)
      const b = (j + 1) * n + i; // (i, j+1)
      const cc = (j + 1) * n + i + 1; // (i+1, j+1)
      const d = j * n + i + 1; // (i+1, j)
      idx[p++] = a;
      idx[p++] = b;
      idx[p++] = cc;
      idx[p++] = a;
      idx[p++] = cc;
      idx[p++] = d;
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.setIndex(new BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mesh = new Mesh(geo, new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
