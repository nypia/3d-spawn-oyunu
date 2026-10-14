import {
  DirectionalLight,
  Fog,
  HemisphereLight,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { World } from '../sim/world/World';
import type { GameAssets } from './assets/loadAssets';
import { CameraRig } from './CameraRig';
import { DamageNumbers } from './DamageNumbers';
import { HeroView } from './HeroView';
import { PropsView } from './PropsView';
import { PulseFx } from './PulseFx';
import type { QualitySettings } from './Quality';
import { Scatter } from './Scatter';
import { HORIZON, Sky } from './Sky';
import { WeaponFx } from './WeaponFx';
import { WorldView } from './WorldView';

/** Güneşin geldiği yön (gölge kamerası ve gökyüzündeki parıltı aynı yönü kullanır). */
const SUN_DIR = new Vector3(25, 45, 15).normalize();

/** Three.js sahnesi: ışıklar, sis, kamera ve görünüm sınıflarının sahibi. */
export class Renderer3D {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly rig: CameraRig;
  private readonly sun: DirectionalLight;
  private readonly hero: HeroView;
  private readonly worldView: WorldView;
  private readonly weaponFx = new WeaponFx();
  private readonly props: PropsView;
  private readonly pulses = new PulseFx();
  private readonly sky = new Sky(SUN_DIR);
  private readonly scatter: Scatter;
  readonly damageNumbers = new DamageNumbers();
  private time = 0;

  constructor(
    container: HTMLElement,
    quality: QualitySettings,
    enemyCapacity: number,
    readonly assets: GameAssets,
  ) {
    this.renderer = new WebGLRenderer({ antialias: quality.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.maxPixelRatio));
    this.renderer.outputColorSpace = SRGBColorSpace;
    // Neutral: ACES çizgi film renklerini soldurur, bu doygunluğu korur.
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(60, 1, 0.1, 400);
    this.rig = new CameraRig(this.camera);

    this.scene.background = HORIZON;
    this.scene.fog = new Fog(HORIZON, 55, 165);

    // Soğuk gök ışığı + sıcak güneş: gölgeler mavimsi, aydınlık yüzler sıcak kalır.
    const hemi = new HemisphereLight(0xcfe6ff, 0x5b7a3c, 1.35);
    this.scene.add(hemi);
    this.sun = new DirectionalLight(0xffe9c4, 2.7);
    this.sun.castShadow = quality.shadows;
    this.sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    const sc = this.sun.shadow.camera;
    sc.left = -32;
    sc.right = 32;
    sc.top = 32;
    sc.bottom = -32;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    this.scene.add(this.sky.root);
    this.scatter = new Scatter(assets, quality.grassCount);
    this.scene.add(this.scatter.root);
    this.worldView = new WorldView(enemyCapacity, quality.shadows, assets);
    this.hero = new HeroView(assets, quality.shadows);
    this.props = new PropsView(quality.shadows, assets);
    this.scene.add(
      this.worldView.root,
      ...this.hero.objects,
      this.weaponFx.root,
      this.props.root,
      this.pulses.mesh,
      this.damageNumbers.mesh,
    );

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** Başlangıç ekranındaki kozmetik karakter seçimi. */
  setHero(id: string): void {
    this.hero.setHero(id);
  }

  setWorld(world: World): void {
    this.worldView.setWorld(world);
    this.scatter.build(world);
    this.props.setWorld(world);
    this.weaponFx.reset(world);
    this.pulses.reset(world);
    this.damageNumbers.reset(world);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Dar (dikey) ekranlarda görüş alanını biraz aç.
    this.camera.fov = w / h < 1 ? 75 : 60;
    this.camera.updateProjectionMatrix();
  }

  render(world: World, dt: number, cinematic: boolean): void {
    this.time += dt;
    const p = world.player;
    if (cinematic) this.rig.orbit(p, world.terrain, dt);
    else this.rig.update(p, world.terrain, dt);

    // Güneş (ve gölge kamerası) oyuncuyu takip eder.
    this.sun.position.set(p.x + SUN_DIR.x * 55, p.y + SUN_DIR.y * 55, p.z + SUN_DIR.z * 55);
    this.sun.target.position.set(p.x, p.y, p.z);

    this.hero.update(p, world.terrain, dt, this.time, world.gameOver);
    this.worldView.update(world, this.time, dt);
    this.weaponFx.update(world, this.time, dt);
    this.props.update(world, this.time);
    this.scatter.update(this.time, p.x, p.z);
    this.sky.update(this.camera.position, this.time);
    this.pulses.update(world, dt);
    this.damageNumbers.update(world, dt);
    this.renderer.render(this.scene, this.camera);
  }
}
