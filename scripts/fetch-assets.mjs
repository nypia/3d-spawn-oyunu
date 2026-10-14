// Kenney (CC0) modellerini indirip oyunun kullandığı GLB'leri src/assets/ altına yazar.
//  - Zip'ler .cache/kenney/ altına bir kez indirilir (git'e girmez).
//  - Her GLB küçültülür: dış doku referansları (Textures/colormap.png), kullanılmayan animasyonlar ve
//    öznitelikler silinir, ikili veri yalnızca kalan parçalarla yeniden paketlenir.
//  - Her kitin colormap dokusu ayrı PNG olarak kopyalanır (oyun onu kendisi yükler).
//  - CREDITS.md yeniden yazılır.
// Çıktılar repoya commit edilir; build ve CI bu betiği çalıştırmaz. Kullanım: npm run fetch-assets
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CACHE = '.cache/kenney';
const OUT_MODELS = 'src/assets/models';
const OUT_TEXTURES = 'src/assets/textures';

/** Karakterlerde tutulacak animasyonlar (Kenney kitlerinde ortak isimler). */
const CHARACTER_ANIMS = [
  'static',
  'idle',
  'walk',
  'sprint',
  'jump',
  'fall',
  'crouch',
  'die',
  'holding-right',
  'holding-right-shoot',
  'emote-yes',
];

const KITS = [
  {
    kit: 'characters',
    title: 'Mini Characters',
    page: 'https://kenney.nl/assets/mini-characters',
    url: 'https://kenney.nl/media/pages/assets/mini-characters/bfc7e272b4-1774770718/kenney_mini-characters.zip',
    dir: 'Models/GLB format',
    texture: 'Models/GLB format/Textures/colormap.png',
    anims: CHARACTER_ANIMS,
    // Başlangıç ekranında seçilebilen dört maceracı (ilki varsayılan).
    models: ['character-male-f', 'character-female-f', 'character-male-b', 'character-female-b'],
  },
  {
    kit: 'graveyard',
    title: 'Graveyard Kit',
    page: 'https://kenney.nl/assets/graveyard-kit',
    url: 'https://kenney.nl/media/pages/assets/graveyard-kit/ba8d4b4517-1760691807/kenney_graveyard-kit_5.0.zip',
    dir: 'Models/GLB format',
    texture: 'Models/GLB format/Textures/colormap.png',
    anims: CHARACTER_ANIMS,
    models: [
      'character-skeleton',
      'pillar-obelisk',
      'gravestone-round',
      'gravestone-cross',
      'gravestone-broken',
      'gravestone-bevel',
      'candle-multiple',
    ],
  },
  {
    kit: 'dungeon',
    title: 'Mini Dungeon',
    page: 'https://kenney.nl/assets/mini-dungeon',
    url: 'https://kenney.nl/media/pages/assets/mini-dungeon/6cd72dc849-1785314274/kenney_mini-dungeon.zip',
    dir: 'Models/GLB format',
    texture: 'Models/GLB format/Textures/colormap.png',
    anims: CHARACTER_ANIMS,
    models: ['character-orc', 'chest', 'pot', 'coin'],
  },
  {
    kit: 'nature',
    title: 'Nature Kit',
    page: 'https://kenney.nl/assets/nature-kit',
    url: 'https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip',
    dir: 'Models/GLTF format',
    texture: null,
    anims: [],
    models: [
      'tree_oak',
      'tree_default',
      'tree_fat',
      'tree_plateau',
      'tree_small',
      'tree_pineRoundA',
      'tree_pineRoundC',
      'tree_pineTallA_detailed',
      'tree_cone',
      'rock_largeA',
      'rock_largeB',
      'rock_largeC',
      'rock_largeD',
      'rock_tallA',
      'rock_tallB',
      'rock_smallA',
      'rock_smallC',
      'flower_purpleA',
      'flower_redA',
      'flower_yellowA',
      'flower_yellowB',
      'flower_redB',
      'mushroom_red',
      'mushroom_redGroup',
      'mushroom_tanGroup',
      'plant_bush',
      'plant_bushDetailed',
      'plant_bushLarge',
      'plant_bushSmall',
      'grass_large',
      'stump_round',
      'stump_old',
      'log',
    ],
  },
];

// ------------------------------------------------------------------ GLB okuma/yazma

function readGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('GLB değil');
  let off = 12;
  let json = null;
  let bin = Buffer.alloc(0);
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = Buffer.from(data);
    off += 8 + len;
  }
  return { json, bin };
}

function pad4(buf, fill) {
  const extra = (4 - (buf.length % 4)) % 4;
  return extra ? Buffer.concat([buf, Buffer.alloc(extra, fill)]) : buf;
}

function writeGlb(json, bin) {
  const jsonBuf = pad4(Buffer.from(JSON.stringify(json), 'utf8'), 0x20);
  const binBuf = pad4(bin, 0);
  const header = Buffer.alloc(12);
  const total = 12 + 8 + jsonBuf.length + (binBuf.length ? 8 + binBuf.length : 0);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const chunk = (type, data) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(data.length, 0);
    h.writeUInt32LE(type, 4);
    return Buffer.concat([h, data]);
  };
  const parts = [header, chunk(0x4e4f534a, jsonBuf)];
  if (binBuf.length) parts.push(chunk(0x004e4942, binBuf));
  return Buffer.concat(parts);
}

/**
 * Dokuları, fazla öznitelikleri ve istenmeyen animasyonları siler; ikili veriyi yalnızca kullanılan
 * accessor'larla yeniden paketler.
 */
function stripGlb(buf, keepAnims) {
  const { json, bin } = readGlb(buf);
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const m of json.materials ?? []) {
    if (m.pbrMetallicRoughness) {
      delete m.pbrMetallicRoughness.baseColorTexture;
      delete m.pbrMetallicRoughness.metallicRoughnessTexture;
    }
    delete m.normalTexture;
    delete m.occlusionTexture;
    delete m.emissiveTexture;
  }
  for (const mesh of json.meshes ?? []) {
    for (const p of mesh.primitives) {
      delete p.attributes.TANGENT;
      delete p.attributes.TEXCOORD_1;
    }
  }
  if (json.animations) {
    json.animations = keepAnims.length ? json.animations.filter((a) => keepAnims.includes(a.name)) : [];
    if (!json.animations.length) delete json.animations;
  }

  // Kullanılan accessor'lar → yeni indeksler.
  const used = new Map();
  const use = (i) => {
    if (i === undefined) return undefined;
    if (!used.has(i)) used.set(i, used.size);
    return used.get(i);
  };
  for (const mesh of json.meshes ?? []) {
    for (const p of mesh.primitives) {
      for (const k of Object.keys(p.attributes)) p.attributes[k] = use(p.attributes[k]);
      if (p.indices !== undefined) p.indices = use(p.indices);
      for (const t of p.targets ?? []) for (const k of Object.keys(t)) t[k] = use(t[k]);
    }
  }
  for (const s of json.skins ?? [])
    if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = use(s.inverseBindMatrices);
  for (const a of json.animations ?? []) {
    for (const s of a.samplers) {
      s.input = use(s.input);
      s.output = use(s.output);
    }
  }
  const oldAccessors = json.accessors ?? [];
  const accessors = new Array(used.size);
  for (const [oldIdx, newIdx] of used) {
    const acc = { ...oldAccessors[oldIdx] };
    if (acc.sparse) throw new Error('sparse accessor desteklenmiyor');
    accessors[newIdx] = acc;
  }

  // Kullanılan bufferView'ları sırayla yeni ikili veriye kopyala.
  const oldViews = json.bufferViews ?? [];
  const viewMap = new Map();
  const views = [];
  const chunks = [];
  let length = 0;
  for (const acc of accessors) {
    if (acc.bufferView === undefined) continue;
    if (!viewMap.has(acc.bufferView)) {
      const v = oldViews[acc.bufferView];
      const data = bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
      const padded = pad4(Buffer.from(data), 0);
      const nv = { buffer: 0, byteOffset: length, byteLength: v.byteLength };
      if (v.byteStride) nv.byteStride = v.byteStride;
      if (v.target) nv.target = v.target;
      viewMap.set(acc.bufferView, views.length);
      views.push(nv);
      chunks.push(padded);
      length += padded.length;
    }
    acc.bufferView = viewMap.get(acc.bufferView);
  }
  json.accessors = accessors;
  json.bufferViews = views;
  json.buffers = [{ byteLength: length }];
  if (json.extensionsUsed) {
    json.extensionsUsed = json.extensionsUsed.filter((e) => e !== 'KHR_texture_transform');
    if (!json.extensionsUsed.length) delete json.extensionsUsed;
  }
  return writeGlb(json, Buffer.concat(chunks));
}

// ------------------------------------------------------------------ çalıştır

mkdirSync(CACHE, { recursive: true });
rmSync(OUT_MODELS, { recursive: true, force: true });
mkdirSync(OUT_TEXTURES, { recursive: true });
let total = 0;
for (const k of KITS) {
  const zip = join(CACHE, k.url.split('/').pop());
  if (!existsSync(zip)) {
    console.log(`indiriliyor: ${k.title}`);
    execFileSync('curl', ['-sSfL', '--retry', '3', '-o', zip, k.url]);
  }
  const unzip = (path) => execFileSync('unzip', ['-p', zip, path], { maxBuffer: 64 << 20 });
  mkdirSync(join(OUT_MODELS, k.kit), { recursive: true });
  for (const name of k.models) {
    const out = stripGlb(unzip(`${k.dir}/${name}.glb`), k.anims);
    writeFileSync(join(OUT_MODELS, k.kit, `${name}.glb`), out);
    total += out.length;
  }
  if (k.texture) {
    const png = unzip(k.texture);
    writeFileSync(join(OUT_TEXTURES, `${k.kit}.png`), png);
    total += png.length;
  }
  console.log(`${k.title}: ${k.models.length} model`);
}

const credits = `# Asset'ler ve lisanslar

Oyundaki 3D modellerin hepsi [Kenney](https://kenney.nl) tarafından **CC0 1.0** (kamu malı) lisansıyla
yayınlanmıştır. Atıf zorunlu değildir, ama emeğine teşekkür ederiz.

| Paket | Kullanılan | Kaynak |
|---|---|---|
${KITS.map((k) => `| ${k.title} | ${k.models.length} model${k.texture ? ' + renk dokusu' : ''} | ${k.page} |`).join('\n')}

Modeller \`npm run fetch-assets\` ile indirilip küçültülür (dış doku bağlantıları ve kullanılmayan animasyonlar
silinir). Balçık, Yarasa, Patlayan ve Golem gibi diğer modeller koddan üretilir (\`src/render\`).

## Yazı tipleri

| Yazı tipi | Kullanım | Lisans | Kaynak |
|---|---|---|---|
| Baloo 2 (Ek Type) | Başlıklar, HUD | SIL Open Font License 1.1 | https://github.com/EkType/Baloo2 |
| Nunito (Vernon Adams) | Metin | SIL Open Font License 1.1 | https://github.com/googlefonts/nunito |

Yazı tipleri [Fontsource](https://fontsource.org) paketlerinden alınır ve derlemeye gömülür.
`;
writeFileSync('CREDITS.md', credits);
console.log(`toplam ${(total / 1024).toFixed(0)} KB`);
