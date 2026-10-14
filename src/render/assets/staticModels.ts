import {
  type BufferGeometry,
  Color,
  Float32BufferAttribute,
  type Material,
  type Matrix4,
  Mesh,
  type MeshLambertMaterial,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ModelAsset } from './loadAssets';

/**
 * Statik Kenney modellerini instanced çizime hazırlar: tüm parçalar tek geometride birleşir
 * (ağaç, kaya, çiçek gibi yüzlerce kopya tek draw call olsun).
 */

function collect(asset: ModelAsset, fn: (mesh: Mesh, world: Matrix4) => void): void {
  asset.scene.updateMatrixWorld(true);
  asset.scene.traverse((o) => {
    if (o instanceof Mesh) fn(o, o.matrixWorld);
  });
}

/**
 * Nature-kit'in kendi paleti turkuaz; dünyanın çizgi film yeşilleriyle uyumlu olsun diye materyal adına
 * göre yeniden renklendirilir. `_defaultMat` (kaya taşı, mantar sapı) modele göre verilir.
 */
export const NATURE_PALETTE: Readonly<Record<string, number>> = {
  grass: 0x5cbf43,
  leafsGreen: 0x53b13f,
  leafsDark: 0x2f8f4e,
  dirt: 0x9b6b45,
  woodBark: 0x8a5a36,
  woodBarkDark: 0x6e4630,
  woodInner: 0xe8c9a0,
};

const tmpColor = new Color();

/**
 * Dokusuz modeller (nature-kit): her materyalin rengi vertex rengine yazılır, tek geometri döner.
 * `palette` materyal adına göre renk değiştirir.
 */
export function coloredGeometry(
  asset: ModelAsset,
  palette: Readonly<Record<string, number>> = {},
): BufferGeometry {
  const parts: BufferGeometry[] = [];
  collect(asset, (mesh, world) => {
    const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    src.applyMatrix4(world);
    const n = src.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = src.groups.length ? src.groups : [{ start: 0, count: n, materialIndex: 0 }];
    // toNonIndexed sonrası grup aralıkları vertex aralığıdır.
    for (const g of groups) {
      const m = mats[g.materialIndex ?? 0] as MeshLambertMaterial;
      const override = palette[m.name];
      const c = override !== undefined ? tmpColor.setHex(override) : m.color;
      for (let v = g.start; v < Math.min(n, g.start + g.count); v++) {
        colors[v * 3] = c.r;
        colors[v * 3 + 1] = c.g;
        colors[v * 3 + 2] = c.b;
      }
    }
    src.setAttribute('color', new Float32BufferAttribute(colors, 3));
    for (const name of Object.keys(src.attributes)) {
      if (!['position', 'normal', 'color'].includes(name)) src.deleteAttribute(name);
    }
    src.clearGroups();
    parts.push(src);
  });
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('Model birleştirilemedi');
  return merged;
}

/** Dokulu kit modelleri (colormap): uv korunur, ilk parçanın materyali kullanılır. */
export function texturedModel(asset: ModelAsset): { geometry: BufferGeometry; material: Material } {
  const parts: BufferGeometry[] = [];
  let material: Material | null = null;
  collect(asset, (mesh, world) => {
    const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    src.applyMatrix4(world);
    for (const name of Object.keys(src.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) src.deleteAttribute(name);
    }
    src.clearGroups();
    parts.push(src);
    material ??= Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  });
  const geometry = mergeGeometries(parts);
  if (!geometry || !material) throw new Error('Model birleştirilemedi');
  return { geometry, material };
}

/** Geometrinin sınır kutusu boyutları (x, y, z). */
export function size(geo: BufferGeometry): [number, number, number] {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  if (!b) return [1, 1, 1];
  return [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
}
