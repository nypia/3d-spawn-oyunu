import {
  type AnimationAction,
  AnimationMixer,
  BoxGeometry,
  Group,
  LoopOnce,
  LoopRepeat,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  PlaneGeometry,
  Vector3,
} from 'three';
import { HEROES } from '../data/heroes';
import type { Player } from '../sim/player/Player';
import type { Heightmap } from '../sim/terrain/Heightmap';
import type { GameAssets } from './assets/loadAssets';
import { radialShadowTexture } from './BlobShadows';
import { build } from './shapes';

/** Kenney karakterleri ~0.67 m: oyuncu ~1.7 m olsun. */
const HERO_SCALE = 2.5;
const FADE = 0.15;
const CLIPS = ['idle', 'walk', 'sprint', 'jump', 'fall', 'crouch', 'die'] as const;
type ClipName = (typeof CLIPS)[number];

interface HeroModel {
  scene: Group;
  mixer: AnimationMixer;
  actions: Record<ClipName, AnimationAction>;
  materials: MeshLambertMaterial[];
}

/** Sırt çantası: maceracının alameti (gövde kemiğine bağlı, model uzayında ölçeksiz birimler). */
function backpackGeometry() {
  return build([
    [new BoxGeometry(0.13, 0.15, 0.07), 0x9c6a3a],
    [new BoxGeometry(0.14, 0.05, 0.08).translate(0, 0.06, 0.004), 0x7a4f2a],
    [new BoxGeometry(0.09, 0.05, 0.025).translate(0, -0.025, -0.045), 0x7a4f2a],
    // Üstte rulo uyku tulumu.
    [new BoxGeometry(0.16, 0.04, 0.04).translate(0, 0.095, -0.015), 0x4f7a3a],
  ]);
}

/**
 * Oyuncu karakteri: Kenney maceracısı, AnimationMixer ile geçişli animasyonlar.
 * Hızla durma/yürüme/koşma, havada zıplama/düşme, kayarken çömelme, oyun sonunda ölüm.
 */
export class HeroView {
  readonly root = new Group();
  private readonly models = new Map<string, HeroModel>();
  private current: HeroModel | null = null;
  private currentClip: ClipName | null = null;
  private readonly shadow: Mesh;
  private landSquash = 0;
  private wasGrounded = true;

  constructor(
    private readonly assets: GameAssets,
    private readonly castShadows: boolean,
  ) {
    this.shadow = new Mesh(
      new PlaneGeometry(1.3, 1.3).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({
        map: radialShadowTexture(),
        transparent: true,
        depthWrite: false,
        opacity: castShadows ? 0.35 : 0.6,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    this.shadow.renderOrder = -1;
    this.root.name = 'player';
    this.setHero(HEROES[0].id);
  }

  /** Kozmetik karakter seçimi (başlangıç ekranı). */
  setHero(id: string): void {
    const def = HEROES.find((h) => h.id === id) ?? HEROES[0];
    let model = this.models.get(def.id);
    if (!model) {
      model = this.build(def.model);
      this.models.set(def.id, model);
    }
    if (this.current) this.root.remove(this.current.scene);
    this.current = model;
    this.currentClip = null;
    this.root.add(model.scene);
  }

  private build(key: string): HeroModel {
    const asset = this.assets.model(key);
    const scene = asset.scene;
    scene.scale.setScalar(HERO_SCALE);
    // Dokunma/parlama efektleri için karakterin kendi materyalleri (kit içi paylaşımdan ayrılır).
    const materials: MeshLambertMaterial[] = [];
    scene.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      o.castShadow = this.castShadows;
      o.frustumCulled = false;
      const m = (o.material as MeshLambertMaterial).clone();
      o.material = m;
      materials.push(m);
    });
    this.attachBackpack(scene);

    const mixer = new AnimationMixer(scene);
    const actions = {} as Record<ClipName, AnimationAction>;
    for (const name of CLIPS) {
      const clip = asset.animations.find((a) => a.name === name);
      if (!clip) throw new Error(`Karakter klibi yok: ${name}`);
      const a = mixer.clipAction(clip);
      const once = name === 'jump' || name === 'die' || name === 'crouch';
      a.setLoop(once ? LoopOnce : LoopRepeat, Number.POSITIVE_INFINITY);
      a.clampWhenFinished = once;
      actions[name] = a;
    }
    return { scene, mixer, actions, materials };
  }

  /** Çanta dinlenme pozunda sırta oturtulur, sonra gövde kemiğiyle birlikte hareket eder. */
  private attachBackpack(scene: Group): void {
    const torso = scene.getObjectByName('torso');
    if (!torso) return;
    scene.updateMatrixWorld(true);
    const pack = new Mesh(
      backpackGeometry(),
      new MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    );
    pack.castShadow = this.castShadows;
    // Model uzayında (ölçeksiz) sırtta bir nokta → kemiğin yerel uzayı.
    const worldPos = new Vector3(0, 0.25, -0.11).applyMatrix4(scene.matrixWorld);
    const inv = new Matrix4().copy(torso.matrixWorld).invert();
    pack.position.copy(worldPos.applyMatrix4(inv));
    const s = new Vector3();
    torso.matrixWorld.decompose(new Vector3(), pack.quaternion, s);
    pack.quaternion.invert();
    pack.scale.set(HERO_SCALE / s.x, HERO_SCALE / s.y, HERO_SCALE / s.z);
    (torso as Object3D).add(pack);
  }

  /** Sahneye eklenecek kökler (karakter + temas gölgesi). */
  get objects(): Object3D[] {
    return [this.root, this.shadow];
  }

  private play(name: ClipName, timeScale = 1): void {
    const m = this.current;
    if (!m) return;
    const next = m.actions[name];
    next.timeScale = timeScale;
    if (this.currentClip === name) return;
    const prev = this.currentClip ? m.actions[this.currentClip] : null;
    next.reset().play();
    if (prev) next.crossFadeFrom(prev, FADE, false);
    this.currentClip = name;
  }

  update(p: Player, terrain: Heightmap, dt: number, time: number, dead: boolean): void {
    const m = this.current;
    if (!m) return;
    this.root.position.set(p.x, p.y, p.z);
    this.root.rotation.y = p.facing;

    if (p.grounded && !this.wasGrounded) this.landSquash = 0.18;
    this.wasGrounded = p.grounded;
    this.landSquash = Math.max(0, this.landSquash - dt * 1.4);

    const speed = p.speed;
    let lean = 0;
    if (dead) this.play('die');
    else if (p.sliding) {
      this.play('crouch');
      lean = 0.35;
    } else if (!p.grounded) this.play(p.vy > 0 ? 'jump' : 'fall');
    else if (speed > 8) this.play('sprint', Math.min(1.6, speed / 9));
    else if (speed > 0.6) this.play('walk', Math.max(0.6, speed / 5));
    else this.play('idle');
    m.mixer.update(dt);

    // Yere iniş ezilmesi ve kayma eğimi.
    m.scene.rotation.x = lean;
    const sq = this.landSquash;
    m.scene.scale.set(HERO_SCALE * (1 + sq * 0.5), HERO_SCALE * (1 - sq), HERO_SCALE * (1 + sq * 0.5));

    // Hasarda kırmızı, dokunulmazlıkta (Anka Tüyü) altın parıltı.
    const hurt = p.hurtTimer > 0 ? p.hurtTimer / 0.25 : 0;
    const holy = p.invuln > 0 ? 0.35 + Math.sin(time * 18) * 0.25 : 0;
    for (const mat of m.materials)
      mat.emissive.setRGB(hurt * 0.9 + holy, hurt * 0.1 + holy * 0.75, holy * 0.1);

    // Temas gölgesi: zeminde, zıplayınca küçülür.
    const ground = terrain.heightAt(p.x, p.z);
    const lift = Math.max(0, p.y - ground);
    this.shadow.position.set(p.x, ground + 0.04, p.z);
    this.shadow.scale.setScalar(Math.max(0.4, 1 - lift * 0.15));
  }
}
