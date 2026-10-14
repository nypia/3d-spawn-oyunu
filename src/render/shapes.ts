import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
} from 'three';

/**
 * Yer tutucu low-poly modeller (M3'te Kenney/Quaternius modelleriyle değişecek).
 * Parçalar vertex rengiyle boyanıp tek geometride birleştirilir → instance başına tek draw call.
 * Vertex rengi beyaz olan kısımlar materyal/instance rengini alır, diğerleri kendi rengini korur.
 */
export type Part = [geometry: BufferGeometry, color: number];

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

export function build(parts: Part[]): BufferGeometry {
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

export function golemGeometry(): BufferGeometry {
  const body = new DodecahedronGeometry(0.75, 0).scale(1, 1.1, 0.85).translate(0, 1, 0);
  const head = new DodecahedronGeometry(0.38, 0).translate(0, 1.95, 0.1);
  const armL = new DodecahedronGeometry(0.32, 0).scale(1, 1.6, 1).translate(-0.85, 0.8, 0.1);
  const armR = new DodecahedronGeometry(0.32, 0).scale(1, 1.6, 1).translate(0.85, 0.8, 0.1);
  const eyeL = new SphereGeometry(0.07, 5, 4).translate(-0.14, 2, 0.42);
  const eyeR = new SphereGeometry(0.07, 5, 4).translate(0.14, 2, 0.42);
  return build([
    [body, WHITE],
    [head, WHITE],
    [armL, 0xcfc6b8],
    [armR, 0xcfc6b8],
    [eyeL, 0xffa21a],
    [eyeR, 0xffa21a],
  ]);
}

export function bombGeometry(): BufferGeometry {
  const body = new IcosahedronGeometry(0.5, 1).translate(0, 0.55, 0);
  const fuse = new CylinderGeometry(0.06, 0.06, 0.3, 5).translate(0, 1.15, 0);
  const spark = new IcosahedronGeometry(0.1, 0).translate(0, 1.32, 0);
  const eyeL = new SphereGeometry(0.08, 6, 4).translate(-0.17, 0.68, 0.42);
  const eyeR = new SphereGeometry(0.08, 6, 4).translate(0.17, 0.68, 0.42);
  return build([
    [body, WHITE],
    [fuse, 0x3a3a40],
    [spark, 0xfff2a8],
    [eyeL, 0xffffff],
    [eyeR, 0xffffff],
  ]);
}

export function arrowGeometry(): BufferGeometry {
  const shaft = new CylinderGeometry(0.035, 0.035, 0.8, 4).rotateX(Math.PI / 2);
  const tip = new ConeGeometry(0.09, 0.22, 4).rotateX(Math.PI / 2).translate(0, 0, 0.48);
  return build([
    [shaft, 0x8a5a33],
    [tip, 0xff4d6d],
  ]);
}

export function vaseGeometry(): BufferGeometry {
  const body = new SphereGeometry(0.42, 8, 6).scale(1, 1.15, 1).translate(0, 0.45, 0);
  const neck = new CylinderGeometry(0.18, 0.24, 0.25, 8).translate(0, 0.98, 0);
  const lip = new CylinderGeometry(0.26, 0.22, 0.08, 8).translate(0, 1.12, 0);
  const band = new CylinderGeometry(0.43, 0.43, 0.1, 8).translate(0, 0.55, 0);
  return build([
    [body, 0xc8743f],
    [neck, 0xb5652f],
    [lip, 0xd98a52],
    [band, 0x6b3a1f],
  ]);
}

export function chestGeometry(): BufferGeometry {
  const body = new BoxGeometry(1.2, 0.65, 0.8).translate(0, 0.33, 0);
  const lid = new CylinderGeometry(0.4, 0.4, 1.2, 8, 1, false, 0, Math.PI)
    .rotateZ(Math.PI / 2)
    .translate(0, 0.65, 0);
  const band = new BoxGeometry(0.14, 0.7, 0.84).translate(0, 0.36, 0);
  const lock = new BoxGeometry(0.2, 0.22, 0.06).translate(0, 0.55, 0.42);
  return build([
    [body, WHITE],
    [lid, WHITE],
    [band, 0xf2c94c],
    [lock, 0xf2c94c],
  ]);
}

export function shrineGeometry(): BufferGeometry {
  const base = new CylinderGeometry(2.2, 2.4, 0.25, 10).translate(0, 0.12, 0);
  const parts: Part[] = [[base, 0x9a958c]];
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    parts.push([
      new BoxGeometry(0.35, 1.8, 0.35).translate(Math.sin(a) * 1.7, 1.1, Math.cos(a) * 1.7),
      0xb8b2a6,
    ]);
  }
  parts.push([new OctahedronGeometry(0.45, 0).scale(1, 1.6, 1).translate(0, 1.6, 0), WHITE]);
  return build(parts);
}

export function coinGeometry(): BufferGeometry {
  return new CylinderGeometry(0.22, 0.22, 0.06, 10).rotateX(Math.PI / 2);
}

export function healGeometry(): BufferGeometry {
  const meat = new SphereGeometry(0.25, 7, 5).scale(1, 0.8, 1.2);
  const bone = new CylinderGeometry(0.06, 0.06, 0.35, 5).rotateX(Math.PI / 2).translate(0, 0, 0.35);
  return build([
    [meat, 0xb5482c],
    [bone, 0xf3ead8],
  ]);
}

export function magnetGeometry(): BufferGeometry {
  const arc = new TorusGeometry(0.25, 0.08, 5, 10, Math.PI);
  const tipL = new BoxGeometry(0.16, 0.14, 0.16).translate(-0.25, -0.05, 0);
  const tipR = new BoxGeometry(0.16, 0.14, 0.16).translate(0.25, -0.05, 0);
  return build([
    [arc, 0xe53935],
    [tipL, 0xeeeeee],
    [tipR, 0xeeeeee],
  ]);
}

/**
 * Nadir pickup'ların üstündeki ışık sütunu: açık silindir, alttan üste beyazdan siyaha solar.
 * Toplamalı (additive) karışımla siyah görünmez → üst uç yumuşakça kaybolur. Renk instance renginden gelir.
 */
export function beamGeometry(height = 7, radius = 0.22): BufferGeometry {
  const g = new CylinderGeometry(radius, radius * 0.6, height, 10, 4, true).translate(0, height / 2, 0);
  const pos = g.getAttribute('position');
  const c = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = (1 - pos.getY(i) / height) ** 1.5;
    c[i * 3] = v;
    c[i * 3 + 1] = v;
    c[i * 3 + 2] = v;
  }
  g.setAttribute('color', new Float32BufferAttribute(c, 3));
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g;
}

/** Meşale (mangal): ayak + kase. Alev ayrı mesh (titreşim için). */
export function brazierGeometry(): BufferGeometry {
  const foot = new CylinderGeometry(0.28, 0.34, 0.12, 8).translate(0, 0.06, 0);
  const pole = new CylinderGeometry(0.07, 0.09, 0.95, 6).translate(0, 0.55, 0);
  const bowl = new CylinderGeometry(0.4, 0.2, 0.28, 8).translate(0, 1.12, 0);
  const rim = new TorusGeometry(0.38, 0.05, 4, 10).rotateX(Math.PI / 2).translate(0, 1.26, 0);
  const coals = new CylinderGeometry(0.33, 0.33, 0.05, 8).translate(0, 1.22, 0);
  return build([
    [foot, 0x3d3530],
    [pole, 0x4a4038],
    [bowl, 0x4a4038],
    [rim, 0xc9a24a],
    [coals, 0xff5a1f],
  ]);
}

/** Alev: dış turuncu koni + iç sarı çekirdek. Taban y=0. */
export function flameGeometry(): BufferGeometry {
  const outer = new ConeGeometry(0.26, 0.7, 7).translate(0, 0.35, 0);
  const inner = new ConeGeometry(0.14, 0.45, 6).translate(0, 0.24, 0);
  return build([
    [outer, 0xff3a00],
    [inner, 0xffb000],
  ]);
}

export function bagGeometry(): BufferGeometry {
  const sack = new SphereGeometry(0.24, 7, 5).scale(1, 0.9, 1);
  const neck = new CylinderGeometry(0.07, 0.12, 0.12, 6).translate(0, 0.24, 0);
  const tie = new TorusGeometry(0.08, 0.025, 4, 8).rotateX(Math.PI / 2).translate(0, 0.22, 0);
  const coin = new CylinderGeometry(0.1, 0.1, 0.03, 8).rotateX(Math.PI / 2).translate(0, 0, 0.23);
  return build([
    [sack, 0x9a6a35],
    [neck, 0x8a5a2b],
    [tie, 0xffcf33],
    [coin, 0xffcf33],
  ]);
}

/** Saat: dik duran altın çerçeveli kadran. */
export function clockGeometry(): BufferGeometry {
  const rim = new CylinderGeometry(0.32, 0.32, 0.1, 14).rotateX(Math.PI / 2);
  const face = new CylinderGeometry(0.26, 0.26, 0.11, 14).rotateX(Math.PI / 2);
  const hour = new BoxGeometry(0.04, 0.14, 0.02).translate(0, 0.07, 0.065);
  const minute = new BoxGeometry(0.17, 0.035, 0.02).translate(0.085, 0, 0.065);
  const knob = new SphereGeometry(0.06, 5, 4).translate(0, 0.37, 0);
  return build([
    [rim, 0xffc93c],
    [face, 0xfff8e6],
    [hour, 0x222222],
    [minute, 0x222222],
    [knob, 0xffc93c],
  ]);
}

/** Tespih: kutsal haç + boncuk halkası. */
export function rosaryGeometry(): BufferGeometry {
  const v = new BoxGeometry(0.1, 0.56, 0.08).translate(0, -0.05, 0);
  const h = new BoxGeometry(0.36, 0.1, 0.08).translate(0, 0.08, 0);
  const beads = new TorusGeometry(0.22, 0.03, 4, 14).translate(0, 0.36, 0);
  return build([
    [v, 0xfff3c4],
    [h, 0xfff3c4],
    [beads, 0xc9a24a],
  ]);
}
