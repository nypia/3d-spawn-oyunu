import {
  Color,
  DirectionalLight,
  Fog,
  HalfFloatType,
  HemisphereLight,
  NeutralToneMapping,
  type Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { World } from '../sim/world/World';
import type { GameAssets } from './assets/loadAssets';
import { CameraRig } from './CameraRig';
import { CROWD_BLOOD } from './crowd/CrowdMesh';
import { DamageNumbers } from './DamageNumbers';
import { Effects } from './fx/Effects';
import { HazardView } from './HazardView';
import { HeroView } from './HeroView';
import { PropsView } from './PropsView';
import { PulseFx } from './PulseFx';
import type { QualitySettings } from './Quality';
import { Scatter } from './Scatter';
import { BLOOD_HORIZON, HORIZON, Sky } from './Sky';
import { WeaponFx } from './WeaponFx';
import { WorldView } from './WorldView';

/** Güneşin geldiği yön (gölge kamerası ve gökyüzündeki parıltı aynı yönü kullanır). */
const BLOOD_SKY = new Color(0xb07890);
const BLOOD_GROUND = new Color(0x3a1420);
const BLOOD_SUN = new Color(0xffa898);
const SUN_DIR = new Vector3(25, 45, 15).normalize();

/** Three.js sahnesi: ışıklar, sis, kamera ve görünüm sınıflarının sahibi. */
export class Renderer3D {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly rig: CameraRig;
  private readonly sun: DirectionalLight;
  private readonly hemi: HemisphereLight;
  private readonly fogColor = HORIZON.clone();
  /** Gündüz (0) → Kan Ayı gecesi (1) geçişi. */
  private blood = -1;
  private readonly hero: HeroView;
  private readonly worldView: WorldView;
  private readonly hazardView = new HazardView();
  private readonly weaponFx = new WeaponFx();
  private readonly props: PropsView;
  private readonly pulses = new PulseFx();
  private readonly sky = new Sky(SUN_DIR);
  private readonly scatter: Scatter;
  readonly damageNumbers = new DamageNumbers();
  private readonly effects: Effects;
  /** Yalnızca yüksek kalitede: bloom (parlayan taş, büyü, alev) için HDR art işlem. */
  private composer: EffectComposer | null = null;
  private time = 0;
  /** Kare hızı hedefin altında geçen süre (otomatik kalite düşürme). */
  private slowTime = 0;
  private pixelRatio: number;

  constructor(
    container: HTMLElement,
    quality: QualitySettings,
    enemyCapacity: number,
    readonly assets: GameAssets,
    /** Kalite elle seçilmediyse yavaş cihazda bloom ve çözünürlük kendiliğinden düşer. */
    private readonly adaptive = false,
  ) {
    // Bloom varken kenar yumuşatma composer'ın MSAA hedefinde yapılır (tuval MSAA'sı boşa gider).
    this.renderer = new WebGLRenderer({
      antialias: quality.antialias && !quality.bloom,
      powerPreference: 'high-performance',
    });
    this.pixelRatio = Math.min(window.devicePixelRatio, quality.maxPixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    // Composer birden çok geçiş çizer: sayaçları kare başında biz sıfırlarız (DebugOverlay doğru saysın).
    this.renderer.info.autoReset = false;
    this.renderer.outputColorSpace = SRGBColorSpace;
    // Neutral: ACES çizgi film renklerini soldurur, bu doygunluğu korur.
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(60, 1, 0.1, 400);
    this.rig = new CameraRig(this.camera);

    this.scene.background = this.fogColor;
    this.scene.fog = new Fog(this.fogColor, 55, 165);

    // Soğuk gök ışığı + sıcak güneş: gölgeler mavimsi, aydınlık yüzler sıcak kalır.
    this.hemi = new HemisphereLight(0xcfe6ff, 0x5b7a3c, 1.35);
    this.scene.add(this.hemi);
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
    this.effects = new Effects(assets, quality.name === 'low', quality.bloom, this.pulses);
    this.scene.add(
      this.worldView.root,
      ...this.hero.objects,
      this.weaponFx.root,
      this.props.root,
      this.hazardView.root,
      this.pulses.mesh,
      this.effects.root,
      this.damageNumbers.mesh,
    );

    if (quality.bloom) {
      const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: quality.antialias ? 4 : 0 });
      const composer = new EffectComposer(this.renderer, target);
      composer.addPass(new RenderPass(this.scene, this.camera));
      // Eşik ~1: yalnızca HDR (ışıyan) yüzeyler parlar; güneşli çimen ve gök parlamaz.
      composer.addPass(new UnrealBloomPass(new Vector2(256, 256), 0.55, 0.45, 1.0));
      composer.addPass(new OutputPass());
      this.composer = composer;
    }

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private readonly orbHalo = (x: number, y: number, z: number, size: number, hex: number) =>
    this.effects.halo(x, y, z, size, hex);

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
    this.effects.reset(world);
    this.damageNumbers.reset(world);
  }

  /**
   * Shader'ları yükleme ekranı arkasında derler (ilk iskelet ya da ilk patlamada takılma olmasın).
   * Henüz boş olduğu için gizli duran efekt katmanları da geçici olarak görünür yapılır.
   */
  async warmUp(): Promise<void> {
    const hidden: Object3D[] = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    try {
      // Paralel derleme uzantısı yoksa compileAsync uyarı basar; eşzamanlı derleme aynı işi görür.
      if (this.renderer.extensions.has('KHR_parallel_shader_compile')) {
        await this.renderer.compileAsync(this.scene, this.camera);
      } else {
        this.renderer.compile(this.scene, this.camera);
      }
    } finally {
      for (const o of hidden) o.visible = false;
    }
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
    this.camera.aspect = w / h;
    // Dar (dikey) ekranlarda görüş alanını biraz aç.
    this.camera.fov = w / h < 1 ? 75 : 60;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Zayıf GPU koruması: toplam 3 sn boyunca 45 FPS'in altında kalınırsa önce bloom kapanır, sonra
   * piksel oranı 1'e iner. Hızlı kareler sayacı eritir; tek seferlik takılma (dt en fazla 0.1) yetmez.
   */
  private adapt(dt: number): void {
    if (!this.adaptive || dt <= 0) return;
    if (dt > 1 / 45) this.slowTime += dt;
    else this.slowTime = Math.max(0, this.slowTime - dt * 0.5);
    if (this.slowTime < 3) return;
    this.slowTime = 0;
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    } else if (this.pixelRatio > 1) {
      this.pixelRatio = 1;
      this.renderer.setPixelRatio(1);
      this.resize();
    }
  }

  /**
   * Menüde kahraman paneli örtmesin: geniş ekranda görüntü sağa, dikey ekranda yukarı kaydırılır
   * (kamera görüş penceresi kaydırma). Oyuna geçerken kamera geçişiyle birlikte sıfırlanır.
   */
  private menuFraming(): void {
    const menu = 1 - this.rig.blend;
    if (menu < 0.002) {
      if (this.camera.view?.enabled) this.camera.clearViewOffset();
      return;
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const portrait = w < h;
    this.camera.setViewOffset(w, h, portrait ? 0 : -w * 0.17 * menu, portrait ? h * 0.2 * menu : 0, w, h);
  }

  /** Kan Ayı: gök, sis ve ışıklar kızıl geceye döner, düşmanlara kızıl kenar parıltısı. */
  private setBlood(b: number): void {
    const s = b * b * (3 - 2 * b);
    if (s === this.blood) return;
    this.blood = s;
    this.sky.setBlood(s);
    this.fogColor.copy(HORIZON).lerp(BLOOD_HORIZON, s);
    const fog = this.scene.fog as Fog;
    // Fog rengi kopyalar: aynı nesne değil, ayrıca güncellenmeli.
    fog.color.copy(this.fogColor);
    fog.near = 55 - 15 * s;
    fog.far = 165 - 35 * s;
    this.hemi.color.setHex(0xcfe6ff).lerp(BLOOD_SKY, s);
    this.hemi.groundColor.setHex(0x5b7a3c).lerp(BLOOD_GROUND, s);
    this.hemi.intensity = 1.35 - 0.3 * s;
    this.sun.color.setHex(0xffe9c4).lerp(BLOOD_SUN, s);
    this.sun.intensity = 2.7 - 1.0 * s;
    CROWD_BLOOD.value = s;
  }

  render(world: World, dt: number, cinematic: boolean): void {
    this.time += dt;
    if (!cinematic) this.adapt(dt);
    const p = world.player;
    if (cinematic) this.rig.orbit(p, world.terrain, dt);
    else this.rig.update(p, world.terrain, dt);
    this.menuFraming();

    this.setBlood(world.cycle > 1 ? Math.min(1, (world.time - world.bloodMoonAt) / 4) : 0);

    // Güneş (ve gölge kamerası) oyuncuyu takip eder.
    this.sun.position.set(p.x + SUN_DIR.x * 55, p.y + SUN_DIR.y * 55, p.z + SUN_DIR.z * 55);
    this.sun.target.position.set(p.x, p.y, p.z);

    this.hero.update(p, world.terrain, dt, this.time, world.gameOver);
    this.worldView.update(world, this.time, dt);
    this.effects.begin();
    this.weaponFx.update(world, this.time, dt, this.orbHalo);
    this.props.update(world, this.time);
    this.hazardView.update(world, this.time);
    this.scatter.update(this.time, p.x, p.z);
    this.sky.update(this.camera.position, this.time);
    this.pulses.update(world, dt);
    this.effects.update(world, dt, this.time, this.camera.position);
    this.damageNumbers.update(world, dt);
    this.renderer.info.reset();
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
