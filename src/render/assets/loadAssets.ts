import {
  type AnimationClip,
  type BufferGeometry,
  type Group,
  ImageLoader,
  type Material,
  Mesh,
  MeshLambertMaterial,
  type MeshStandardMaterial,
  NearestFilter,
  SRGBColorSpace,
  Texture,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Oyunun 3D modelleri (Kenney, CC0) ve renk dokuları. Hepsi build'e data URI olarak gömülür
 * (`?url&inline`): Artifact tek dosya kalır, ağdan ayrıca bir şey indirilmez.
 * GLB'ler `npm run fetch-assets` ile küçültülmüştür; dış doku referansı yoktur, dokular burada ayrıca
 * yüklenip materyallere bağlanır.
 */
const MODEL_URLS = import.meta.glob<string>('../../assets/models/**/*.glb', {
  query: '?url&inline',
  import: 'default',
  eager: true,
});
const TEXTURE_URLS = import.meta.glob<string>('../../assets/textures/*.png', {
  query: '?url&inline',
  import: 'default',
  eager: true,
});

export interface ModelAsset {
  scene: Group;
  animations: AnimationClip[];
}

export class GameAssets {
  constructor(
    private readonly models: ReadonlyMap<string, ModelAsset>,
    /** Kit adı → colormap dokusu (yüklenemezse null: modeller düz renkte kalır). */
    readonly textures: ReadonlyMap<string, Texture | null>,
  ) {}

  /** "kit/isim" ile model, ör. "graveyard/character-skeleton". */
  model(key: string): ModelAsset {
    const m = this.models.get(key);
    if (!m) throw new Error(`Model bulunamadı: ${key}`);
    return m;
  }

  has(key: string): boolean {
    return this.models.has(key);
  }

  keys(): string[] {
    return [...this.models.keys()];
  }
}

/** "../../assets/models/graveyard/x.glb" → "graveyard/x" */
function modelKey(path: string): string {
  return path.replace(/^.*assets\/models\//, '').replace(/\.glb$/, '');
}

async function toArrayBuffer(uri: string): Promise<ArrayBuffer> {
  if (!uri.startsWith('data:')) return (await fetch(uri)).arrayBuffer();
  const bin = atob(uri.slice(uri.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** Kenney colormap'i: hücre renkleri bulanıklaşmasın diye en yakın komşu, mipmap yok. */
function loadTexture(uri: string): Promise<Texture | null> {
  return new Promise((resolve) => {
    new ImageLoader().load(
      uri,
      (image) => {
        const t = new Texture(image);
        t.flipY = false;
        t.colorSpace = SRGBColorSpace;
        t.magFilter = NearestFilter;
        t.minFilter = NearestFilter;
        t.generateMipmaps = false;
        t.needsUpdate = true;
        resolve(t);
      },
      undefined,
      () => resolve(null),
    );
  });
}

/**
 * GLTFLoader'ın PBR materyallerini, dünyanın geri kalanıyla uyumlu ve mobilde ucuz Lambert'e çevirir.
 * Aynı isimli materyaller kit içinde paylaşılır (daha az shader/program).
 */
function convertMaterials(scene: Group, map: Texture | null, cache: Map<string, Material>): void {
  scene.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const src = o.material as MeshStandardMaterial;
    const geo = o.geometry as BufferGeometry;
    const textured = !!map && !!geo.getAttribute('uv');
    const key = `${src.name}|${src.color.getHexString()}|${textured}|${!!geo.getAttribute('color')}`;
    let mat = cache.get(key);
    if (!mat) {
      mat = new MeshLambertMaterial({
        name: src.name,
        color: src.color,
        map: textured ? map : null,
        vertexColors: !!geo.getAttribute('color'),
        transparent: src.transparent,
        opacity: src.opacity,
        side: src.side,
      });
      cache.set(key, mat);
    }
    o.material = mat;
    src.dispose();
  });
}

export async function loadAssets(onProgress?: (done: number, total: number) => void): Promise<GameAssets> {
  const modelPaths = Object.keys(MODEL_URLS);
  const texturePaths = Object.keys(TEXTURE_URLS);
  const total = modelPaths.length + texturePaths.length;
  let done = 0;
  const tick = () => onProgress?.(++done, total);

  const textures = new Map<string, Texture | null>();
  await Promise.all(
    texturePaths.map(async (p) => {
      const kit = p.replace(/^.*\//, '').replace(/\.png$/, '');
      textures.set(kit, await loadTexture(TEXTURE_URLS[p]));
      tick();
    }),
  );

  const loader = new GLTFLoader();
  const models = new Map<string, ModelAsset>();
  const materialCaches = new Map<string, Map<string, Material>>();
  for (const p of modelPaths) {
    const key = modelKey(p);
    const kit = key.split('/')[0];
    const gltf = await loader.parseAsync(await toArrayBuffer(MODEL_URLS[p]), '');
    const cache = materialCaches.get(kit) ?? new Map<string, Material>();
    materialCaches.set(kit, cache);
    convertMaterials(gltf.scene, textures.get(kit) ?? null, cache);
    models.set(key, { scene: gltf.scene, animations: gltf.animations });
    tick();
  }
  return new GameAssets(models, textures);
}
