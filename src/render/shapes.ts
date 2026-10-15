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

export function gemGeometry(): BufferGeometry {
  return new OctahedronGeometry(0.22, 0).scale(0.8, 1.2, 0.8);
}

export function boltGeometry(): BufferGeometry {
  return new IcosahedronGeometry(1, 0);
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

export function arrowGeometry(): BufferGeometry {
  const shaft = new CylinderGeometry(0.035, 0.035, 0.8, 4).rotateX(Math.PI / 2);
  const tip = new ConeGeometry(0.09, 0.22, 4).rotateX(Math.PI / 2).translate(0, 0, 0.48);
  return build([
    [shaft, 0x8a5a33],
    [tip, 0xff4d6d],
  ]);
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

/** Ruh Kazanı: üç ayaklı demir kazan, altında odunlar (~1,4 m). Sıvı ayrı çizilir (dolum seviyesi). */
export function cauldronGeometry(): BufferGeometry {
  // Kürenin alt %65'i: ağzı yukarıda açık kazan.
  const body = new SphereGeometry(1, 14, 9, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65)
    .scale(1, 0.85, 1)
    .translate(0, 1.0, 0);
  const rimY = 1.0 + Math.cos(Math.PI * 0.35) * 0.85;
  const rimR = Math.sin(Math.PI * 0.35);
  const rim = new TorusGeometry(rimR, 0.09, 6, 18).rotateX(Math.PI / 2).translate(0, rimY, 0);
  const parts: Part[] = [
    [body, 0x34363f],
    [rim, 0x4b4f5c],
  ];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    parts.push([
      new CylinderGeometry(0.07, 0.1, 0.45, 5).translate(Math.sin(a) * 0.62, 0.22, Math.cos(a) * 0.62),
      0x2a2b31,
    ]);
  }
  for (let k = 0; k < 2; k++) {
    parts.push([new BoxGeometry(1.4, 0.16, 0.16).rotateY(k * 1.4 + 0.3).translate(0, 0.08, 0), 0x6b4423]);
  }
  // Kulplar.
  for (const s of [-1, 1]) {
    parts.push([
      new TorusGeometry(0.16, 0.04, 4, 8).rotateY(Math.PI / 2).translate(s * (rimR + 0.1), rimY - 0.1, 0),
      0x4b4f5c,
    ]);
  }
  return build(parts);
}

/** Kazanın içindeki sıvı yüzeyi (y = 0'da, birim yarıçap). */
export function liquidGeometry(): BufferGeometry {
  return new CylinderGeometry(1, 1, 0.04, 16);
}
