import {
  type AnimationAction,
  type AnimationClip,
  AnimationMixer,
  type BufferAttribute,
  type BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  FloatType,
  LoopOnce,
  LoopRepeat,
  type Material,
  Matrix4,
  Mesh,
  NearestFilter,
  type Object3D,
  type Quaternion,
  RGBAFormat,
  SkinnedMesh,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ModelAsset } from '../assets/loadAssets';

/**
 * Animasyonlu kalabalıklar için "pişirme": bir rig (Kenney parça hiyerarşisi, skinned mesh ya da koddan
 * tanımlı prosedürel rig) tek bir geometriye ve kemik matrisleri dokusuna çevrilir.
 *  - Her vertex tam olarak bir kemiğe bağlıdır (`aBone`). Kenney rig'lerinde ağırlıklar zaten tek kemik.
 *  - Doku: genişlik = kemik × 4 texel (sütun başına bir RGBA), yükseklik = tüm kliplerin kare sayısı.
 *  - Shader instance başına iki kareyi okuyup ara değer alır (bkz. CrowdMesh).
 */

export interface BakedClip {
  /** Dokudaki ilk satır. */
  start: number;
  frames: number;
  fps: number;
  loop: boolean;
  duration: number;
}

export interface BakedRig {
  geometry: BufferGeometry;
  /** Geometri grupları bu materyallere eşlenir (çoğunlukla tek materyal). */
  materials: Material[];
  bones: number;
  texture: DataTexture;
  clips: Record<string, BakedClip>;
  /** Ölçeklenmiş model yüksekliği (m). */
  height: number;
}

export interface ClipSpec {
  /** Pişmiş klibin adı (varsayılan: kaynak klip adı). */
  name: string;
  /** Kaynak klip adı (yoksa `name`). */
  source?: string;
  fps?: number;
  loop?: boolean;
  /** Bu kemiklerin yerel dönüşü başka bir klipten alınır (ör. yürürken yay tutan kol). */
  overlay?: { source: string; bones: string[] };
}

/**
 * Bir kemiğe iliştirilen ek parça (ör. okçunun yayı). Geometri metre cinsinden ve dünya eksenlerinde,
 * orijini kemiğin ucunda (dinlenme pozunda kemiğe bağlı vertex'lerin pivottan en uzak noktası, ör. el).
 */
export interface Attachment {
  bone: string;
  geometry: BufferGeometry;
  /** `materials` dizisindeki indeks (varsayılan 0). */
  material?: number;
  /** Kendi renginde ışıma (bloom'da parlar; ör. bekçinin büyü küresi). */
  glow?: number;
}

const DEFAULT_FPS = 30;

/**
 * Tüm parçaların ortak öznitelik kümesi (mergeGeometries aynı öznitelikleri ister). Vertex başına diziler
 * (`bone`, `glow`) kaynak geometrinin vertex sırasıyla eşleşir.
 */
function normalizeAttributes(
  geo: BufferGeometry,
  bone: number | Float32Array,
  glow: number | Float32Array,
): BufferGeometry {
  const src = geo.clone();
  const n = src.getAttribute('position').count;
  const fill = (v: number | Float32Array) => (typeof v === 'number' ? new Float32Array(n).fill(v) : v);
  src.setAttribute('aBone', new Float32BufferAttribute(fill(bone), 1));
  src.setAttribute('aGlow', new Float32BufferAttribute(fill(glow), 1));
  if (!src.getAttribute('uv')) src.setAttribute('uv', new Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!src.getAttribute('color')) {
    src.setAttribute('color', new Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  }
  for (const name of Object.keys(src.attributes)) {
    if (!['position', 'normal', 'uv', 'color', 'aBone', 'aGlow'].includes(name)) src.deleteAttribute(name);
  }
  src.morphAttributes = {};
  if (!src.getAttribute('normal')) src.computeVertexNormals();
  // Hepsi indeksli olmalı (mergeGeometries); paylaşılan vertex'ler GPU'da bir kez dönüştürülür.
  if (!src.index) src.setIndex(Array.from({ length: n }, (_, i) => i));
  return src;
}

function makeTexture(bones: number, rows: number): DataTexture {
  const data = new Float32Array(bones * 4 * rows * 4);
  const tex = new DataTexture(data, bones * 4, rows, RGBAFormat, FloatType);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

function writeMatrix(tex: DataTexture, bones: number, row: number, bone: number, m: Matrix4): void {
  const data = tex.image.data as Float32Array;
  data.set(m.elements, (row * bones * 4 + bone * 4) * 4);
}

// ------------------------------------------------------------------ Kenney / glTF rig'leri

type Slot =
  | { kind: 'rigid'; mesh: Mesh }
  | { kind: 'skin'; mesh: SkinnedMesh; joint: number }
  | { kind: 'node'; node: Object3D; restInverse: Matrix4 };

const tmpM = new Matrix4();
const tmpM2 = new Matrix4();

function slotMatrix(slot: Slot, scale: Matrix4, out: Matrix4): Matrix4 {
  switch (slot.kind) {
    case 'rigid':
      return out.multiplyMatrices(scale, slot.mesh.matrixWorld);
    case 'skin': {
      // three'nin skinning formülü: matrixWorld · bindMatrixInverse · bone.matrixWorld · boneInverse · bindMatrix
      const m = slot.mesh;
      const bone = m.skeleton.bones[slot.joint];
      tmpM.multiplyMatrices(m.matrixWorld, m.bindMatrixInverse);
      tmpM.multiply(bone.matrixWorld).multiply(m.skeleton.boneInverses[slot.joint]).multiply(m.bindMatrix);
      return out.multiplyMatrices(scale, tmpM);
    }
    case 'node':
      tmpM2.multiplyMatrices(slot.node.matrixWorld, slot.restInverse);
      return out.multiplyMatrices(scale, tmpM2);
  }
}

/** Skinned mesh'te her vertex'in baskın kemiği. */
function dominantJoint(geo: BufferGeometry): Float32Array {
  const idx = geo.getAttribute('skinIndex') as BufferAttribute;
  const w = geo.getAttribute('skinWeight') as BufferAttribute;
  const out = new Float32Array(idx.count);
  for (let i = 0; i < idx.count; i++) {
    const ws = [w.getX(i), w.getY(i), w.getZ(i), w.getW(i)];
    const is = [idx.getX(i), idx.getY(i), idx.getZ(i), idx.getW(i)];
    let best = 0;
    for (let k = 1; k < 4; k++) if (ws[k] > ws[best]) best = k;
    out[i] = is[best];
  }
  return out;
}

export interface BakeGltfOptions {
  /** Hedef boy (m); model buna göre ölçeklenir. */
  height: number;
  clips: ClipSpec[];
  attachments?: Attachment[];
  /** Ek materyaller (ilk materyal modelinki). */
  extraMaterials?: Material[];
}

export function bakeGltf(model: ModelAsset, opts: BakeGltfOptions): BakedRig {
  const root = model.scene;
  root.updateMatrixWorld(true);

  // Dinlenme pozunda ölçek: model boyu → hedef boy.
  const meshes: Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof Mesh) meshes.push(o);
  });
  if (!meshes.length) throw new Error('Rig içinde mesh yok');
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const v = new Vector3();
  for (const m of meshes) {
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
  }
  const s = opts.height / Math.max(1e-3, maxY - Math.min(0, minY));
  const scale = new Matrix4().makeScale(s, s, s);

  // Kemik yuvaları ve parça geometrileri.
  const slots: Slot[] = [];
  const parts: BufferGeometry[] = [];
  const partMaterial: number[] = [];
  for (const m of meshes) {
    if (m instanceof SkinnedMesh) {
      const base = slots.length;
      for (let j = 0; j < m.skeleton.bones.length; j++) slots.push({ kind: 'skin', mesh: m, joint: j });
      const joints = dominantJoint(m.geometry);
      for (let i = 0; i < joints.length; i++) joints[i] += base;
      parts.push(normalizeAttributes(m.geometry, joints, 0));
    } else {
      parts.push(normalizeAttributes(m.geometry, slots.length, 0));
      slots.push({ kind: 'rigid', mesh: m });
    }
    partMaterial.push(0);
  }
  for (const a of opts.attachments ?? []) {
    const node = root.getObjectByName(a.bone);
    if (!node) throw new Error(`Kemik yok: ${a.bone}`);
    // Dinlenme pozunda kemiği takip eder; geometri kemik ucuna taşınıp ölçeksiz model uzayına çevrilir.
    const inv = new Matrix4().copy(node.matrixWorld).invert();
    const tip = boneTip(meshes, node);
    const g = a.geometry
      .clone()
      .applyMatrix4(new Matrix4().makeScale(1 / s, 1 / s, 1 / s))
      .translate(tip.x, tip.y, tip.z);
    parts.push(normalizeAttributes(g, slots.length, a.glow ?? 0));
    slots.push({ kind: 'node', node, restInverse: inv });
    partMaterial.push(a.material ?? 0);
  }

  const geometry = mergeGeometries(parts, true);
  if (!geometry) throw new Error('Geometri birleştirilemedi');
  geometry.groups.forEach((g, i) => {
    g.materialIndex = partMaterial[i];
  });
  const materials = [meshes[0].material as Material, ...(opts.extraMaterials ?? [])];

  // Klipleri örnekle.
  const mixer = new AnimationMixer(root);
  const specs = opts.clips.map((c) => {
    const clip = model.animations.find((a) => a.name === (c.source ?? c.name));
    if (!clip) throw new Error(`Klip yok: ${c.source ?? c.name}`);
    const fps = c.fps ?? DEFAULT_FPS;
    const loop = c.loop ?? true;
    const frames = loop ? Math.max(1, Math.round(clip.duration * fps)) : Math.round(clip.duration * fps) + 1;
    return { spec: c, clip, fps, loop, frames };
  });
  const rows = specs.reduce((n, s) => n + s.frames, 0);
  const texture = makeTexture(slots.length, rows);
  const clips: Record<string, BakedClip> = {};
  const out = new Matrix4();
  const overlayQ = new Map<Object3D, Quaternion>();
  let row = 0;
  for (const { spec, clip, fps, loop, frames } of specs) {
    clips[spec.name] = { start: row, frames, fps, loop, duration: clip.duration };
    const overlay = spec.overlay ? model.animations.find((a) => a.name === spec.overlay?.source) : undefined;
    for (let f = 0; f < frames; f++) {
      const t = Math.min(clip.duration, f / fps);
      overlayQ.clear();
      if (overlay && spec.overlay) {
        sample(mixer, overlay, t % Math.max(1e-3, overlay.duration) || 0, loop);
        for (const name of spec.overlay.bones) {
          const node = root.getObjectByName(name);
          if (node) overlayQ.set(node, node.quaternion.clone());
        }
      }
      sample(mixer, clip, t, loop);
      for (const [node, q] of overlayQ) node.quaternion.copy(q);
      root.updateMatrixWorld(true);
      for (let b = 0; b < slots.length; b++)
        writeMatrix(texture, slots.length, row, b, slotMatrix(slots[b], scale, out));
      row++;
    }
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  texture.needsUpdate = true;
  return { geometry, materials, bones: slots.length, texture, clips, height: opts.height };
}

/** Dinlenme pozunda düğüme bağlı vertex'lerin pivottan en uzak noktası (model uzayı, ölçeksiz). */
function boneTip(meshes: Mesh[], node: Object3D): Vector3 {
  const pivot = new Vector3().setFromMatrixPosition(node.matrixWorld);
  const best = pivot.clone();
  let bestD = -1;
  const p = new Vector3();
  for (const m of meshes) {
    const pos = m.geometry.getAttribute('position');
    let owned: (i: number) => boolean;
    if (m instanceof SkinnedMesh) {
      const j = m.skeleton.bones.indexOf(node as never);
      if (j < 0) continue;
      const joints = dominantJoint(m.geometry);
      owned = (i) => joints[i] === j;
    } else {
      if (m !== node && m.parent !== node) continue;
      owned = () => true;
    }
    for (let i = 0; i < pos.count; i++) {
      if (!owned(i)) continue;
      p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      const d = p.distanceToSquared(pivot);
      if (d > bestD) {
        bestD = d;
        best.copy(p);
      }
    }
  }
  return best;
}

function sample(mixer: AnimationMixer, clip: AnimationClip, t: number, loop: boolean): void {
  mixer.stopAllAction();
  const action: AnimationAction = mixer.clipAction(clip);
  action.reset();
  action.setLoop(loop ? LoopRepeat : LoopOnce, Number.POSITIVE_INFINITY);
  action.clampWhenFinished = true;
  action.play();
  mixer.setTime(t);
}

// ------------------------------------------------------------------ prosedürel rig'ler

export interface ProceduralPart {
  geometry: BufferGeometry;
  bone: number;
  /** 0..1 emissive parıltı (göz, rün, fitil). */
  glow?: number;
  material?: number;
}

export interface ProceduralClip {
  name: string;
  duration: number;
  loop?: boolean;
  fps?: number;
  /** t anında her kemiğin model uzayındaki matrisini yazar. */
  pose: (t: number, bones: Matrix4[]) => void;
}

export interface ProceduralRig {
  bones: number;
  parts: ProceduralPart[];
  clips: ProceduralClip[];
  materials: Material[];
  height: number;
}

export function bakeProcedural(rig: ProceduralRig): BakedRig {
  const parts = rig.parts.map((p) => normalizeAttributes(p.geometry, p.bone, p.glow ?? 0));
  const geometry = mergeGeometries(parts, true);
  if (!geometry) throw new Error('Geometri birleştirilemedi');
  geometry.groups.forEach((g, i) => {
    g.materialIndex = rig.parts[i].material ?? 0;
  });
  const specs = rig.clips.map((c) => {
    const fps = c.fps ?? DEFAULT_FPS;
    const loop = c.loop ?? true;
    const frames = loop ? Math.max(1, Math.round(c.duration * fps)) : Math.round(c.duration * fps) + 1;
    return { c, fps, loop, frames };
  });
  const rows = specs.reduce((n, s) => n + s.frames, 0);
  const texture = makeTexture(rig.bones, rows);
  const mats = Array.from({ length: rig.bones }, () => new Matrix4());
  const clips: Record<string, BakedClip> = {};
  let row = 0;
  for (const { c, fps, loop, frames } of specs) {
    clips[c.name] = { start: row, frames, fps, loop, duration: c.duration };
    for (let f = 0; f < frames; f++) {
      for (const m of mats) m.identity();
      c.pose(Math.min(c.duration, f / fps), mats);
      for (let b = 0; b < rig.bones; b++) writeMatrix(texture, rig.bones, row, b, mats[b]);
      row++;
    }
  }
  texture.needsUpdate = true;
  return { geometry, materials: rig.materials, bones: rig.bones, texture, clips, height: rig.height };
}
