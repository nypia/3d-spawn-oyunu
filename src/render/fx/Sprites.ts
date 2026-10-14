import {
  AdditiveBlending,
  type Blending,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';

/** Yumuşak yuvarlak nokta. */
export const SHAPE_DOT = 0;
/** Dört kollu yıldız ışıltısı (taş toplama, sandık, seviye). */
export const SHAPE_STAR = 1;

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec4 iColor;
/** boy, şekil (0 nokta, 1 yıldız), hıza göre uzama */
attribute vec3 iShape;
varying vec2 vUv;
varying vec4 vColor;
varying float vStar;
void main() {
  vUv = uv;
  vColor = iColor;
  vStar = iShape.y;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  // Kartı yarı boyu kadar kameraya çek: yakındaki zemin ve gövdelerle kesişip düz kenar oluşturmasın.
  float dist = length(mv.xyz);
  mv.xyz *= max(0.0, dist - iShape.x * 0.5) / max(dist, 1e-4);
  // Kameranın dibindeki kartlar ekranı kaplamasın.
  vColor.a *= smoothstep(1.2, 3.0, -mv.z);
  // Kıvılcımlar hareket yönünde (ekran düzleminde) uzar.
  vec2 v = (modelViewMatrix * vec4(iVel, 0.0)).xy;
  float len = length(v);
  vec2 ax = len > 1e-4 ? v / len : vec2(1.0, 0.0);
  vec2 perp = vec2(-ax.y, ax.x);
  float stretch = 1.0 + len * iShape.z;
  mv.xy += (ax * position.x * stretch + perp * position.y) * iShape.x;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
varying float vStar;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float dotA = pow(max(0.0, 1.0 - r), 1.6);
  float rays = max(0.0, 1.0 - abs(p.x * p.y) * 30.0) * pow(max(0.0, 1.0 - r), 1.2);
  float a = mix(dotA, max(dotA * 0.7, rays), vStar) * vColor.a;
  if (a < 0.004) discard;
  #ifdef ADDITIVE
    gl_FragColor = vec4(vColor.rgb * a, 1.0);
  #else
    gl_FragColor = vec4(vColor.rgb, a);
  #endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * Kameraya dönük kart yığını: tek draw call, kart başına konum, hız (uzama), renk + saydamlık ve boy.
 * Toplamalı (parıltı, kıvılcım) ya da normal karışımlı (toz, duman) olabilir. Kartları her kare
 * çağıran doldurur (`begin` → `push`… → `end`).
 */
export class SpriteBatch {
  readonly mesh: Mesh;
  private readonly pos: InstancedBufferAttribute;
  private readonly vel: InstancedBufferAttribute;
  private readonly color: InstancedBufferAttribute;
  private readonly shape: InstancedBufferAttribute;
  private readonly geometry: InstancedBufferGeometry;
  private n = 0;

  constructor(
    readonly capacity: number,
    blending: Blending = AdditiveBlending,
  ) {
    const additive = blending === AdditiveBlending;
    const quad = new PlaneGeometry(1, 1);
    const g = new InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    g.setAttribute('uv', quad.getAttribute('uv'));
    const attr = (size: number) => {
      const a = new InstancedBufferAttribute(new Float32Array(capacity * size), size);
      a.setUsage(DynamicDrawUsage);
      return a;
    };
    this.pos = attr(3);
    this.vel = attr(3);
    this.color = attr(4);
    this.shape = attr(3);
    g.setAttribute('iPos', this.pos);
    g.setAttribute('iVel', this.vel);
    g.setAttribute('iColor', this.color);
    g.setAttribute('iShape', this.shape);
    g.instanceCount = 0;
    this.geometry = g;
    this.mesh = new Mesh(
      g,
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        defines: additive ? { ADDITIVE: '' } : {},
        transparent: true,
        depthWrite: false,
        blending: additive ? AdditiveBlending : NormalBlending,
      }),
    );
    this.mesh.frustumCulled = false;
    // Saydam efektler opak sahneden sonra çizilsin.
    this.mesh.renderOrder = additive ? 3 : 2;
  }

  get count(): number {
    return this.n;
  }

  begin(): void {
    this.n = 0;
  }

  /** Bir kart ekler; havuz doluysa sessizce atlar. */
  push(
    x: number,
    y: number,
    z: number,
    size: number,
    r: number,
    g: number,
    b: number,
    a = 1,
    shape = SHAPE_DOT,
    vx = 0,
    vy = 0,
    vz = 0,
    stretch = 0,
  ): void {
    if (this.n >= this.capacity) return;
    const i = this.n++;
    const p = this.pos.array as Float32Array;
    const v = this.vel.array as Float32Array;
    const c = this.color.array as Float32Array;
    const s = this.shape.array as Float32Array;
    p[i * 3] = x;
    p[i * 3 + 1] = y;
    p[i * 3 + 2] = z;
    v[i * 3] = vx;
    v[i * 3 + 1] = vy;
    v[i * 3 + 2] = vz;
    c[i * 4] = r;
    c[i * 4 + 1] = g;
    c[i * 4 + 2] = b;
    c[i * 4 + 3] = a;
    s[i * 3] = size;
    s[i * 3 + 1] = shape;
    s[i * 3 + 2] = stretch;
  }

  end(): void {
    const n = this.n;
    for (const [a, size] of [
      [this.pos, 3],
      [this.vel, 3],
      [this.color, 4],
      [this.shape, 3],
    ] as const) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * size);
      a.needsUpdate = true;
    }
    this.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
  }
}
