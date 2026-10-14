import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  FrontSide,
  IcosahedronGeometry,
  Matrix4,
  MeshLambertMaterial,
  OctahedronGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { EXPLODER } from '../../data/enemies';
import { build, type Part } from '../shapes';
import type { ProceduralPart, ProceduralRig } from './bakeRig';

/**
 * El yapımı düşman rig'leri: parçalar (vertex renkli low-poly şekiller) + kemik başına poz fonksiyonları.
 * bakeProcedural ile Kenney modelleriyle aynı kalabalık sistemine pişirilir. Birimler metre, orijin
 * ayak hizası, model +Z'ye bakar.
 */

const TAU = Math.PI * 2;
const tmp = new Matrix4();
const tmp2 = new Matrix4();
const axisX = new Vector3(1, 0, 0);
const axisZ = new Vector3(0, 0, 1);

/** out = out · T(p) · R(axis, a) · T(−p): bir pivot etrafında döndürme. */
function rotateAbout(out: Matrix4, px: number, py: number, pz: number, axis: Vector3, a: number): Matrix4 {
  tmp.makeTranslation(px, py, pz);
  tmp2.makeRotationAxis(axis, a);
  tmp.multiply(tmp2);
  tmp2.makeTranslation(-px, -py, -pz);
  tmp.multiply(tmp2);
  return out.multiply(tmp);
}

/** out = out · T(p) · S(sx,sy,sz) · T(−p) */
function scaleAbout(
  out: Matrix4,
  px: number,
  py: number,
  pz: number,
  sx: number,
  sy: number,
  sz: number,
): Matrix4 {
  tmp.makeTranslation(px, py, pz);
  tmp2.makeScale(sx, sy, sz);
  tmp.multiply(tmp2);
  tmp2.makeTranslation(-px, -py, -pz);
  tmp.multiply(tmp2);
  return out.multiply(tmp);
}

function part(parts: Part[], bone: number, glow = 0): ProceduralPart {
  return { geometry: build(parts), bone, glow };
}

function flatMaterial(doubleSided = false): MeshLambertMaterial {
  return new MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    side: doubleSided ? DoubleSide : FrontSide,
  });
}

// ------------------------------------------------------------------ Balçık

/** Zıplayan jöle: yayvan gövde, parlak benek, kocaman gözler. Tek kemik, ezilip uzayarak sekiyor. */
export function slimeRig(): ProceduralRig {
  const green = 0x4cc443;
  const eye = (x: number): Part[] => [
    [new SphereGeometry(0.15, 8, 6).translate(x, 0.6, 0.38), 0xffffff],
    [new SphereGeometry(0.08, 6, 4).translate(x, 0.59, 0.5), 0x1a1a22],
    [new SphereGeometry(0.027, 4, 3).translate(x - 0.03, 0.63, 0.57), 0xffffff],
  ];
  return {
    bones: 1,
    height: 0.85,
    materials: [flatMaterial()],
    parts: [
      part(
        [
          [new SphereGeometry(0.56, 12, 9).scale(1, 0.88, 1).translate(0, 0.49, 0), green],
          [new SphereGeometry(0.38, 10, 7).scale(1, 0.6, 0.7).translate(0, 0.32, 0.27), 0x86df6a],
          [new SphereGeometry(0.035, 4, 3).translate(0.14, 0.2, 0.51), 0x2f7a2a],
          [new BoxGeometry(0.16, 0.035, 0.03).translate(0, 0.36, 0.53), 0x1f4a1c],
          ...eye(-0.19),
          ...eye(0.19),
        ],
        0,
      ),
      // Islak parlaklık beneği hafifçe ışır.
      part(
        [[new SphereGeometry(0.1, 6, 4).scale(1.5, 0.6, 1).translate(-0.24, 0.85, 0.2), 0xeaffde]],
        0,
        0.5,
      ),
    ],
    clips: [
      {
        name: 'walk',
        duration: 0.7,
        pose: (t, b) => {
          const hop = Math.sin((t / 0.7) * Math.PI);
          const ground = (1 - hop) ** 2;
          b[0].makeTranslation(0, hop * 0.32, 0);
          scaleAbout(
            b[0],
            0,
            0,
            0,
            1 + ground * 0.2 - hop * 0.06,
            0.82 + hop * 0.3,
            1 + ground * 0.2 - hop * 0.06,
          );
        },
      },
      {
        name: 'die',
        duration: 0.45,
        loop: false,
        pose: (t, b) => {
          const u = t / 0.45;
          scaleAbout(b[0], 0, 0, 0, 1 + u * 0.8, 1 - u * 0.85, 1 + u * 0.8);
        },
      },
    ],
  };
}

// ------------------------------------------------------------------ Yarasa

function wingGeometry(side: 1 | -1) {
  const s = new Shape();
  const pts: [number, number][] = [
    [0, 0.1],
    [-0.32, 0.26],
    [-0.62, 0.3],
    [-0.95, 0.18],
    [-1.02, -0.06],
    [-0.8, -0.1],
    [-0.66, 0.02],
    [-0.5, -0.15],
    [-0.33, -0.03],
    [-0.16, -0.15],
    [0, -0.06],
  ];
  s.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) s.lineTo(x, y);
  // Kanat yatay düzlemde, hücum kenarı öne (+Z) bakar; omuz pivotu (∓0.2, 0, 0).
  const g = new ShapeGeometry(s).rotateX(Math.PI / 2).translate(-0.18, 0.04, 0);
  if (side === 1) g.scale(-1, 1, 1);
  return g;
}

/** Kanat çırpan yarasa: gövde + iki kanat kemiği; ölünce kanatlarını kapatıp yere düşer. */
export function batRig(hover: number): ProceduralRig {
  const fur = 0x52308c;
  const ear = (x: number, rz: number): Part => [
    new ConeGeometry(0.08, 0.22, 4).rotateZ(rz).translate(x, 0.27, -0.02),
    fur,
  ];
  const flap = (b: Matrix4[], a: number) => {
    rotateAbout(b[1], -0.18, 0.04, 0, axisZ, -a);
    rotateAbout(b[2], 0.18, 0.04, 0, axisZ, a);
  };
  return {
    bones: 3,
    height: 0.6,
    materials: [flatMaterial(true)],
    parts: [
      part(
        [
          [new SphereGeometry(0.26, 9, 7).scale(1, 1.05, 0.95), fur],
          [new SphereGeometry(0.18, 7, 5).translate(0, -0.05, 0.13), 0x7a5aa8],
          ear(-0.13, 0.35),
          ear(0.13, -0.35),
          [new ConeGeometry(0.025, 0.08, 4).rotateX(Math.PI).translate(-0.045, -0.07, 0.23), 0xffffff],
          [new ConeGeometry(0.025, 0.08, 4).rotateX(Math.PI).translate(0.045, -0.07, 0.23), 0xffffff],
        ],
        0,
      ),
      // Parlayan sarı gözler.
      part(
        [
          [new SphereGeometry(0.055, 6, 4).translate(-0.09, 0.08, 0.22), 0xffd23f],
          [new SphereGeometry(0.055, 6, 4).translate(0.09, 0.08, 0.22), 0xffd23f],
        ],
        0,
        1,
      ),
      part([[wingGeometry(-1), 0x3a2266]], 1),
      part([[wingGeometry(1), 0x3a2266]], 2),
    ],
    clips: [
      {
        name: 'walk',
        duration: 0.36,
        pose: (t, b) => {
          const w = Math.sin((t / 0.36) * TAU);
          const bob = -w * 0.08;
          for (const m of b) m.makeTranslation(0, bob, 0);
          // Kanatlar çoğunlukla yukarıda (V): yandan bakınca da görünsün.
          flap(b, w * 0.75 + 0.45);
        },
      },
      {
        name: 'die',
        duration: 0.4,
        loop: false,
        pose: (t, b) => {
          const u = t / 0.4;
          // Havadan yere düşer (instance yüksekliği uçuş irtifasını içerir) ve takla atar.
          for (const m of b) {
            m.makeTranslation(0, -(hover - 0.2) * u * u, 0);
            rotateAbout(m, 0, 0, 0, axisX, u * 1.8);
          }
          flap(b, -0.9 * u);
        },
      },
    ],
  };
}

// ------------------------------------------------------------------ Patlayan

/** Yürüyen bomba: iki ayak, titreyen fitil kıvılcımı; fitil yanınca şişip sallanır. */
export function bombRig(): ProceduralRig {
  const body = 0x2b2f45;
  const metal = 0x6b7090;
  const eye = (x: number, rz: number): Part[] => [
    [new SphereGeometry(0.09, 7, 5).scale(1, 0.75, 0.5).translate(x, 0.71, 0.37), 0xffffff],
    [new SphereGeometry(0.045, 5, 4).translate(x, 0.7, 0.41), 0x111111],
    [new BoxGeometry(0.15, 0.035, 0.03).rotateZ(rz).translate(x, 0.81, 0.39), 0x111111],
  ];
  const foot = (x: number): Part => [new BoxGeometry(0.17, 0.12, 0.27).translate(x, 0.06, 0.04), 0xff6b3d];
  const sparkCenter = new Vector3(0.09, 1.29, 0);
  return {
    bones: 4,
    height: 1.35,
    materials: [flatMaterial()],
    parts: [
      part(
        [
          [new SphereGeometry(0.42, 12, 9).translate(0, 0.62, 0), body],
          [new TorusGeometry(0.42, 0.045, 5, 16).rotateX(Math.PI / 2).translate(0, 0.62, 0), metal],
          [new CylinderGeometry(0.12, 0.14, 0.12, 8).translate(0, 1.06, 0), metal],
          [new CylinderGeometry(0.025, 0.025, 0.2, 5).rotateZ(-0.4).translate(0.05, 1.19, 0), 0xc9a46a],
          ...eye(-0.14, -0.4),
          ...eye(0.14, 0.4),
        ],
        0,
      ),
      part([foot(-0.18)], 1),
      part([foot(0.18)], 2),
      part(
        [
          [
            new IcosahedronGeometry(0.085, 0).translate(sparkCenter.x, sparkCenter.y, sparkCenter.z),
            0xffd23f,
          ],
          [
            new OctahedronGeometry(0.06).translate(sparkCenter.x, sparkCenter.y + 0.03, sparkCenter.z),
            0xff6b1a,
          ],
        ],
        3,
        1,
      ),
    ],
    clips: [
      {
        name: 'walk',
        duration: 0.5,
        pose: (t, b) => {
          const a = (t / 0.5) * TAU;
          const bob = Math.abs(Math.sin(a)) * 0.05;
          b[0].makeTranslation(0, bob, 0);
          rotateAbout(b[0], 0, 0.2, 0, axisZ, Math.sin(a) * 0.12);
          b[3].copy(b[0]);
          const flicker = 1 + Math.sin(a * 3) * 0.3;
          scaleAbout(b[3], sparkCenter.x, sparkCenter.y, sparkCenter.z, flicker, flicker, flicker);
          b[1].makeTranslation(0, Math.max(0, Math.cos(a)) * 0.09, Math.sin(a) * 0.15);
          b[2].makeTranslation(0, Math.max(0, -Math.cos(a)) * 0.09, -Math.sin(a) * 0.15);
        },
      },
      {
        name: 'fuse',
        duration: EXPLODER.fuse,
        loop: false,
        pose: (t, b) => {
          const u = t / EXPLODER.fuse;
          const g = 1 + u * 0.45;
          rotateAbout(b[0], 0, 0.1, 0, axisZ, Math.sin(u * 46) * 0.1 * u);
          scaleAbout(b[0], 0, 0.62, 0, g, g, g);
          b[3].copy(b[0]);
          const s = 1 + u * 1.2;
          scaleAbout(b[3], sparkCenter.x, sparkCenter.y, sparkCenter.z, s, s, s);
        },
      },
      {
        name: 'die',
        duration: 0.45,
        loop: false,
        pose: (t, b) => {
          const u = t / 0.45;
          for (const m of b) {
            rotateAbout(m, 0, 0, -0.4, axisX, -u * 1.3);
            scaleAbout(m, 0, 0, 0, 1, 1 - u * 0.3, 1);
          }
        },
      },
    ],
  };
}

// ------------------------------------------------------------------ Golem

/** Kaya golem: parlayan rün çatlakları ve gözler; ağır adımlarla kollarını sallar, ölünce yüzüstü devrilir. */
export function golemRig(): ProceduralRig {
  const rock = 0x8c8273;
  const dark = 0x6f6658;
  const rune = 0x5ef0ff;
  const SH = 1.68;
  const HIP = 0.78;
  return {
    bones: 5,
    height: 2.35,
    materials: [flatMaterial()],
    parts: [
      part(
        [
          [new DodecahedronGeometry(0.62, 0).scale(1.15, 1, 0.85).translate(0, 1.38, 0), rock],
          [new DodecahedronGeometry(0.42, 0).scale(1.2, 0.7, 0.9).translate(0, 0.92, 0), dark],
          [new DodecahedronGeometry(0.3, 0).scale(1.1, 0.9, 1).translate(0, 2.08, 0.1), 0x9a8f7f],
          [new DodecahedronGeometry(0.16, 0).translate(-0.48, 1.9, -0.05), 0x5c8a3a],
          [new DodecahedronGeometry(0.11, 0).translate(0.36, 2.0, -0.12), 0x5c8a3a],
        ],
        0,
      ),
      part(
        [
          [new BoxGeometry(0.11, 0.05, 0.04).translate(-0.12, 2.1, 0.38), rune],
          [new BoxGeometry(0.11, 0.05, 0.04).translate(0.12, 2.1, 0.38), rune],
          [new BoxGeometry(0.06, 0.38, 0.05).rotateZ(0.25).translate(0.1, 1.45, 0.52), rune],
          [new BoxGeometry(0.25, 0.05, 0.05).rotateZ(-0.2).translate(-0.04, 1.3, 0.52), rune],
        ],
        0,
        1,
      ),
      ...([-1, 1] as const).map((side, k) =>
        part(
          [
            [new DodecahedronGeometry(0.28, 0).scale(1, 1.3, 1).translate(side * 0.86, 1.32, 0), dark],
            [new DodecahedronGeometry(0.33, 0).translate(side * 0.92, 0.78, 0.06), rock],
          ],
          1 + k,
        ),
      ),
      ...([-1, 1] as const).map((side, k) =>
        part(
          [[new DodecahedronGeometry(0.3, 0).scale(1, 1.45, 1).translate(side * 0.33, 0.42, 0), dark]],
          3 + k,
        ),
      ),
    ],
    clips: [
      {
        name: 'walk',
        duration: 1,
        pose: (t, b) => {
          const a = t * TAU;
          const swing = Math.sin(a);
          const bob = Math.abs(Math.cos(a)) * 0.07;
          for (const m of b) {
            m.makeTranslation(0, bob, 0);
            rotateAbout(m, 0, HIP, 0, axisZ, swing * 0.05);
          }
          rotateAbout(b[1], -0.75, SH, 0, axisX, -swing * 0.5);
          rotateAbout(b[2], 0.75, SH, 0, axisX, swing * 0.5);
          b[3].makeTranslation(0, 0, 0);
          b[4].makeTranslation(0, 0, 0);
          rotateAbout(b[3], -0.33, HIP, 0, axisX, swing * 0.45);
          rotateAbout(b[4], 0.33, HIP, 0, axisX, -swing * 0.45);
        },
      },
      {
        name: 'die',
        duration: 0.7,
        loop: false,
        pose: (t, b) => {
          const u = Math.min(1, t / 0.7);
          const fall = u * u * 1.35;
          for (const m of b) rotateAbout(m, 0, 0, 0.6, axisX, fall);
          rotateAbout(b[1], -0.75, SH, 0, axisX, -u * 0.8);
          rotateAbout(b[2], 0.75, SH, 0, axisX, -u * 0.8);
        },
      },
    ],
  };
}
