import {
  BufferGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  OctahedronGeometry,
  SphereGeometry,
} from 'three';

/**
 * Yer tutucu low-poly modeller (M3'te Kenney/Quaternius modelleriyle değişecek).
 * Parçalar vertex rengiyle boyanıp tek geometride birleştirilir → instance başına tek draw call.
 * Vertex rengi beyaz olan kısımlar materyal/instance rengini alır, diğerleri kendi rengini korur.
 */
type Part = [geometry: BufferGeometry, color: number];

function paint(geo: BufferGeometry, color: number): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const r = ((color >> 16) & 255) / 255;
  const gr = ((color >> 8) & 255) / 255;
  const b = (color & 255) / 255;
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = r;
    c[i * 3 + 1] = gr;
    c[i * 3 + 2] = b;
  }
  g.setAttribute('color', new Float32BufferAttribute(c, 3));
  return g;
}

/** Boyanmış (non-indexed) parçaların position/normal/color dizilerini uç uca ekler. */
function mergeColored(geos: BufferGeometry[]): BufferGeometry {
  const merged = new BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const arrays = geos.map((g) => g.getAttribute(name).array as Float32Array);
    const out = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
    let offset = 0;
    for (const a of arrays) {
      out.set(a, offset);
      offset += a.length;
    }
    merged.setAttribute(name, new Float32BufferAttribute(out, 3));
  }
  return merged;
}

function build(parts: Part[]): BufferGeometry {
  const merged = mergeColored(parts.map(([g, c]) => paint(g, c)));
  merged.computeVertexNormals();
  return merged;
}

const WHITE = 0xffffff;
const EYE = 0x1a1a22;

export function slimeGeometry(): BufferGeometry {
  const body = new IcosahedronGeometry(0.58, 1);
  body.scale(1, 0.78, 1);
  body.translate(0, 0.45, 0);
  const eyeL = new SphereGeometry(0.09, 6, 4).translate(-0.18, 0.62, 0.45);
  const eyeR = new SphereGeometry(0.09, 6, 4).translate(0.18, 0.62, 0.45);
  return build([
    [body, WHITE],
    [eyeL, EYE],
    [eyeR, EYE],
  ]);
}

export function skeletonGeometry(): BufferGeometry {
  const body = new CapsuleGeometry(0.28, 0.6, 3, 7).translate(0, 0.62, 0);
  const head = new IcosahedronGeometry(0.27, 0).translate(0, 1.32, 0);
  const eyeL = new SphereGeometry(0.06, 5, 4).translate(-0.1, 1.36, 0.22);
  const eyeR = new SphereGeometry(0.06, 5, 4).translate(0.1, 1.36, 0.22);
  const armL = new CylinderGeometry(0.06, 0.06, 0.6, 5).rotateX(-1.2).translate(-0.33, 0.95, 0.22);
  const armR = new CylinderGeometry(0.06, 0.06, 0.6, 5).rotateX(-1.2).translate(0.33, 0.95, 0.22);
  return build([
    [body, WHITE],
    [head, WHITE],
    [eyeL, 0xff3b30],
    [eyeR, 0xff3b30],
    [armL, WHITE],
    [armR, WHITE],
  ]);
}

export function batGeometry(): BufferGeometry {
  const body = new IcosahedronGeometry(0.3, 0).translate(0, 0, 0);
  const wingL = new ConeGeometry(0.35, 0.8, 3)
    .rotateZ(Math.PI / 2)
    .scale(1, 0.25, 1)
    .translate(-0.55, 0.05, 0);
  const wingR = new ConeGeometry(0.35, 0.8, 3)
    .rotateZ(-Math.PI / 2)
    .scale(1, 0.25, 1)
    .translate(0.55, 0.05, 0);
  const eyeL = new SphereGeometry(0.06, 5, 4).translate(-0.1, 0.08, 0.25);
  const eyeR = new SphereGeometry(0.06, 5, 4).translate(0.1, 0.08, 0.25);
  return build([
    [body, WHITE],
    [wingL, 0xb9a3e8],
    [wingR, 0xb9a3e8],
    [eyeL, 0xffe14d],
    [eyeR, 0xffe14d],
  ]);
}

export function treeGeometry(): BufferGeometry {
  const trunk = new CylinderGeometry(0.18, 0.28, 1.4, 6).translate(0, 0.7, 0);
  const crown1 = new ConeGeometry(1.3, 2.2, 7).translate(0, 2.2, 0);
  const crown2 = new ConeGeometry(0.95, 1.7, 7).translate(0, 3.2, 0);
  return build([
    [trunk, 0x7a5232],
    [crown1, 0x3f8f3a],
    [crown2, 0x4fa548],
  ]);
}

export function rockGeometry(): BufferGeometry {
  const rock = new DodecahedronGeometry(1, 0);
  rock.scale(1, 0.7, 1.1).translate(0, 0.35, 0);
  return build([[rock, 0x8d8a85]]);
}

export function gemGeometry(): BufferGeometry {
  return new OctahedronGeometry(0.22, 0).scale(0.8, 1.2, 0.8);
}

export function boltGeometry(): BufferGeometry {
  return new IcosahedronGeometry(1, 0);
}

export function puffGeometry(): BufferGeometry {
  return new IcosahedronGeometry(0.5, 0);
}

export function axeGeometry(): BufferGeometry {
  const handle = new CylinderGeometry(0.05, 0.05, 1.1, 5).rotateZ(Math.PI / 2);
  const blade = new ConeGeometry(0.32, 0.5, 4)
    .rotateZ(-Math.PI / 2)
    .scale(1, 1, 0.25)
    .translate(0.55, 0, 0);
  return build([
    [handle, 0x7a5232],
    [blade, 0xd8dde6],
  ]);
}

export function pelletGeometry(): BufferGeometry {
  return new IcosahedronGeometry(1, 0);
}

export function orbGeometry(): BufferGeometry {
  const rock = new DodecahedronGeometry(0.42, 0);
  return build([[rock, 0xb7a6ff]]);
}
