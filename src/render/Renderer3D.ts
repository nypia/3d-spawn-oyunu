import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
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
import { WeaponFx } from './WeaponFx';
import { WorldView } from './WorldView';

const SKY = 0x9fd3ff;

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
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(60, 1, 0.1, 400);
    this.rig = new CameraRig(this.camera);

    this.scene.background = new Color(SKY);
    this.scene.fog = new Fog(SKY, 45, 150);

    const hemi = new HemisphereLight(0xdff1ff, 0x4a6b3a, 1.6);
    this.scene.add(hemi);
    this.sun = new DirectionalLight(0xfff1d6, 2.4);
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

    this.worldView = new WorldView(enemyCapacity, quality.shadows, assets);
    this.hero = new HeroView(assets, quality.shadows);
    this.props = new PropsView(quality.shadows);
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
    this.sun.position.set(p.x + 25, p.y + 45, p.z + 15);
    this.sun.target.position.set(p.x, p.y, p.z);

    this.hero.update(p, world.terrain, dt, this.time, world.gameOver);
    this.worldView.update(world, this.time, dt);
    this.weaponFx.update(world, this.time, dt);
    this.props.update(world, this.time);
    this.pulses.update(world, dt);
    this.damageNumbers.update(world, dt);
    this.renderer.render(this.scene, this.camera);
  }
}
