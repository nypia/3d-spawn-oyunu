import {
  BackSide,
  Color,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Ufuk rengi: sis de bununla eşleşir, uzak tepeler gökyüzüne yumuşakça karışır. */
export const HORIZON = new Color(0xbfe6ff);
const ZENITH = new Color(0x3e8ff0);

const CLOUDS = 26;
const m4 = new Matrix4();
const pos = new Vector3();
const quat = new Quaternion();
const scl = new Vector3();
const UP = new Vector3(0, 1, 0);

/** Kabarık low-poly bulut: birkaç top yan yana, altı düz. */
function cloudGeometry() {
  const puffs = [
    [0, 0, 0, 1],
    [1.1, -0.15, 0.2, 0.8],
    [-1.05, -0.2, -0.1, 0.75],
    [0.45, 0.45, -0.2, 0.7],
    [-0.4, 0.35, 0.3, 0.65],
    [1.9, -0.35, -0.1, 0.5],
  ].map(([x, y, z, r]) => new IcosahedronGeometry(r, 1).translate(x, y, z));
  const g = mergeGeometries(puffs);
  if (!g) throw new Error('bulut');
  // Alt yüzü düzleştir.
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) if (p.getY(i) < -0.35) p.setY(i, -0.35);
  g.computeVertexNormals();
  return g;
}

/**
 * Gradyan gökyüzü kubbesi + güneş parıltısı ve süzülen bulutlar. Kameraya bağlı (sonsuz uzaklık hissi),
 * sisten etkilenmez.
 */
export class Sky {
  readonly root = new Group();
  private readonly dome: Mesh;
  private readonly clouds: InstancedMesh;
  private readonly seeds: { a: number; r: number; h: number; s: number; spin: number }[] = [];

  constructor(sunDir: Vector3) {
    this.dome = new Mesh(
      new SphereGeometry(360, 32, 16),
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uZenith: { value: ZENITH },
          uHorizon: { value: HORIZON },
          uSun: { value: sunDir.clone().normalize() },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uZenith;
          uniform vec3 uHorizon;
          uniform vec3 uSun;
          varying vec3 vDir;
          void main() {
            float h = clamp(vDir.y, 0.0, 1.0);
            vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
            float sun = max(dot(vDir, uSun), 0.0);
            col += vec3(1.0, 0.92, 0.7) * (pow(sun, 900.0) * 3.0 + pow(sun, 12.0) * 0.25);
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;

    this.clouds = new InstancedMesh(
      cloudGeometry(),
      new MeshLambertMaterial({ color: 0xffffff, emissive: 0x9ab4cc, flatShading: true, fog: false }),
      CLOUDS,
    );
    this.clouds.instanceMatrix.setUsage(DynamicDrawUsage);
    this.clouds.frustumCulled = false;
    for (let i = 0; i < CLOUDS; i++) {
      const u = (i * 0.6180339) % 1;
      this.seeds.push({
        a: u * Math.PI * 2,
        r: 170 + ((i * 37) % 9) * 15,
        h: 55 + ((i * 53) % 7) * 9,
        s: 7 + ((i * 29) % 5) * 2.5,
        spin: (i * 1.7) % (Math.PI * 2),
      });
    }
    this.root.add(this.dome, this.clouds);
  }

  update(camera: Vector3, time: number): void {
    this.dome.position.copy(camera);
    for (let i = 0; i < CLOUDS; i++) {
      const c = this.seeds[i];
      // Yavaşça dönen bir halka gibi kameranın çevresinde süzülürler.
      const a = c.a + time * 0.004;
      pos.set(camera.x + Math.cos(a) * c.r, c.h, camera.z + Math.sin(a) * c.r);
      quat.setFromAxisAngle(UP, c.spin);
      scl.set(c.s, c.s * 0.75, c.s);
      m4.compose(pos, quat, scl);
      this.clouds.setMatrixAt(i, m4);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
  }
}
