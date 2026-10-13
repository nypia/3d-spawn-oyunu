import {
  CanvasTexture,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
import type { World } from '../sim/world/World';

const MAX_NUMBERS = 90;
/** Bir karede eklenebilecek en fazla yeni sayı (kalabalıkta okunabilirlik). */
const MAX_NEW_PER_FRAME = 24;
const MAX_DIGITS = 5;
const CAP = MAX_NUMBERS * MAX_DIGITS;
const LIFE = 0.75;

interface DamageNumber {
  x: number;
  y: number;
  z: number;
  text: string;
  crit: boolean;
  t: number;
}

const VERT = /* glsl */ `
attribute vec3 aCenter;
attribute float aDigit;
attribute float aOffset;
attribute float aScale;
attribute float aAlpha;
attribute vec3 aColor;
varying vec2 vUv;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vUv = vec2((aDigit + uv.x) / 10.0, uv.y);
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
  mv.x += (position.x + aOffset) * 0.62 * aScale;
  mv.y += position.y * aScale;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 t = texture2D(map, vUv);
  float a = t.a * vAlpha;
  if (a < 0.03) discard;
  gl_FragColor = vec4(t.rgb * vColor, a);
}`;

/** 0-9 rakamlarını tek satırlık bir dokuya çizer (beyaz dolgu, koyu kontur). */
function digitAtlas(): CanvasTexture {
  const cw = 32;
  const ch = 48;
  const canvas = document.createElement('canvas');
  canvas.width = cw * 10;
  canvas.height = ch;
  const g = canvas.getContext('2d');
  if (g) {
    g.font = '900 40px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 7;
    g.strokeStyle = 'rgba(20, 16, 30, 0.9)';
    g.fillStyle = '#ffffff';
    for (let d = 0; d < 10; d++) {
      g.strokeText(String(d), d * cw + cw / 2, ch / 2 + 2);
      g.fillText(String(d), d * cw + cw / 2, ch / 2 + 2);
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Hasar sayıları: her rakam bir instance (kameraya bakan quad), tek draw call.
 * Sim'in hitFx olay akışından beslenir; en fazla 90 sayı ekranda kalır (eskiler düşer).
 */
export class DamageNumbers {
  readonly mesh: Mesh;
  private readonly geo: InstancedBufferGeometry;
  private readonly center = new Float32Array(CAP * 3);
  private readonly digit = new Float32Array(CAP);
  private readonly offset = new Float32Array(CAP);
  private readonly scale = new Float32Array(CAP);
  private readonly alpha = new Float32Array(CAP);
  private readonly color = new Float32Array(CAP * 3);
  private readonly attrs: InstancedBufferAttribute[];
  private readonly list: DamageNumber[] = [];
  private cursor = 0;
  enabled = true;

  constructor() {
    const quad = new PlaneGeometry(1, 1);
    this.geo = new InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.geo.setAttribute('uv', quad.getAttribute('uv'));
    const mk = (arr: Float32Array, size: number, name: string) => {
      const a = new InstancedBufferAttribute(arr, size);
      a.setUsage(DynamicDrawUsage);
      this.geo.setAttribute(name, a);
      return a;
    };
    this.attrs = [
      mk(this.center, 3, 'aCenter'),
      mk(this.digit, 1, 'aDigit'),
      mk(this.offset, 1, 'aOffset'),
      mk(this.scale, 1, 'aScale'),
      mk(this.alpha, 1, 'aAlpha'),
      mk(this.color, 3, 'aColor'),
    ];
    this.geo.instanceCount = 0;
    const mat = new ShaderMaterial({
      uniforms: { map: { value: digitAtlas() } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.name = 'damage-numbers';
  }

  reset(world: World): void {
    this.list.length = 0;
    this.cursor = world.hitFx.written;
  }

  update(world: World, dt: number): void {
    // Çok vuruş varsa sadece en yenileri göster; kritikler her zaman öncelikli.
    const pending = world.hitFx.written - this.cursor;
    const stride = pending > MAX_NEW_PER_FRAME ? pending / MAX_NEW_PER_FRAME : 1;
    let seen = 0;
    let next = 0;
    this.cursor = world.hitFx.drain(this.cursor, (d, o) => {
      if (!this.enabled) return;
      const idx = seen++;
      const crit = d[o + 4] > 0;
      if (!crit && idx < next) return;
      next = idx + stride;
      if (this.list.length >= MAX_NUMBERS) this.list.shift();
      const value = Math.max(1, Math.round(d[o + 3]));
      this.list.push({
        x: d[o] + (Math.random() - 0.5) * 0.6,
        y: d[o + 1],
        z: d[o + 2] + (Math.random() - 0.5) * 0.6,
        text: String(Math.min(99999, value)),
        crit,
        t: 0,
      });
    });

    let k = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i];
      n.t += dt;
      if (n.t >= LIFE) {
        this.list.splice(i, 1);
        continue;
      }
      const u = n.t / LIFE;
      const rise = 1.2 * (1 - (1 - u) * (1 - u));
      const pop = n.t < 0.1 ? 1.35 - n.t * 3.5 : 1;
      const s = (n.crit ? 0.52 : 0.34) * pop;
      const a = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
      const len = n.text.length;
      for (let c = 0; c < len; c++) {
        this.center[k * 3] = n.x;
        this.center[k * 3 + 1] = n.y + rise;
        this.center[k * 3 + 2] = n.z;
        this.digit[k] = n.text.charCodeAt(c) - 48;
        this.offset[k] = c - (len - 1) / 2;
        this.scale[k] = s;
        this.alpha[k] = a;
        if (n.crit) {
          this.color[k * 3] = 1;
          this.color[k * 3 + 1] = 0.82;
          this.color[k * 3 + 2] = 0.25;
        } else {
          this.color[k * 3] = 1;
          this.color[k * 3 + 1] = 1;
          this.color[k * 3 + 2] = 1;
        }
        k++;
      }
    }
    this.geo.instanceCount = k;
    for (const a of this.attrs) a.needsUpdate = true;
  }
}
