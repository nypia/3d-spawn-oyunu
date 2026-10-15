import {
  CylinderGeometry,
  IcosahedronGeometry,
  type Material,
  MeshLambertMaterial,
  TorusGeometry,
} from 'three';
import { ENEMIES } from '../../data/enemies';
import type { GameAssets } from '../assets/loadAssets';
import { build } from '../shapes';
import { type BakedClip, type BakedRig, bakeGltf, bakeProcedural } from './bakeRig';
import { CrowdMesh } from './CrowdMesh';
import { batRig, bombRig, golemRig, slimeRig } from './proceduralRigs';

/**
 * Düşman türü → animasyonlu kalabalık modeli: İskelet, Zombi, Hayalet, Vampir, Bekçi ve Okçu Kenney
 * modelleri; Balçık, Yarasa, Patlayan ve Golem koddan çizilmiş rig'ler.
 */
export interface EnemyLook {
  crowd: CrowdMesh;
  walk: BakedClip;
  die: BakedClip;
  /** Okçu: yay çekme/atış klibi. */
  shoot?: BakedClip;
  /** Patlayan: fitil yanarken şişme. */
  fuse?: BakedClip;
  /** Vampir: atılmadan önce çömelme ve atılırken koşu. */
  windup?: BakedClip;
  dash?: BakedClip;
  /** Bir yürüme döngüsünde alınan yol (m): animasyon hızı gerçek yürüyüşe bağlı. */
  stride: number;
}

/** Okçunun yayı: el ucunda, dikey, öne doğru kavisli (metre, dünya eksenleri). */
function bowGeometry() {
  const r = 0.42;
  const arc = new TorusGeometry(r, 0.035, 5, 14, Math.PI)
    .rotateZ(-Math.PI / 2)
    .rotateY(-Math.PI / 2)
    .translate(0, 0, -r);
  const string = new CylinderGeometry(0.008, 0.008, r * 2, 4).translate(0, 0, -r);
  const grip = new CylinderGeometry(0.045, 0.045, 0.16, 6);
  return build([
    [arc, 0x8b5a2b],
    [string, 0xf2efe6],
    [grip, 0x5a3a1c],
  ]);
}

/** Bekçinin elinde parlayan mor büyü küresi. */
function orbGeometry() {
  return build([[new IcosahedronGeometry(0.15, 1), 0xb45cff]]);
}

/** Goblinin elinde sallanan altın kesesi. */
function sackGeometry() {
  const sack = new IcosahedronGeometry(0.26, 1).scale(1, 1.1, 1).translate(0, -0.3, 0);
  const tie = new TorusGeometry(0.08, 0.03, 4, 8).rotateX(Math.PI / 2).translate(0, -0.04, 0);
  const coin = new CylinderGeometry(0.09, 0.09, 0.03, 8).rotateX(Math.PI / 2).translate(0, -0.3, 0.27);
  return build([
    [sack, 0xa8783a],
    [tie, 0xffcf33],
    [coin, 0xffcf33],
  ]);
}

/** Kenney karakterinin sade yürüyüş + ölüm klipleri. */
function walker(assets: GameAssets, key: string, height: number): BakedRig {
  return bakeGltf(assets.model(key), { height, clips: [{ name: 'walk' }, { name: 'die', loop: false }] });
}

function bake(assets: GameAssets, id: string, hover: number): BakedRig | null {
  switch (id) {
    case 'slime':
      return bakeProcedural(slimeRig());
    case 'bat':
      return bakeProcedural(batRig(hover));
    case 'exploder':
      return bakeProcedural(bombRig());
    case 'golem':
      return bakeProcedural(golemRig());
    case 'skeleton':
      return walker(assets, 'graveyard/character-skeleton', 1.75);
    case 'zombie':
      return walker(assets, 'graveyard/character-zombie', 1.8);
    case 'ghost':
      return walker(assets, 'graveyard/character-ghost', 1.6);
    case 'vampire':
      return bakeGltf(assets.model('graveyard/character-vampire'), {
        height: 1.9,
        clips: [
          { name: 'walk' },
          { name: 'windup', source: 'crouch', loop: false },
          { name: 'dash', source: 'sprint' },
          { name: 'die', loop: false },
        ],
      });
    case 'keeper':
      return bakeGltf(assets.model('graveyard/character-keeper'), {
        height: 1.9,
        clips: [
          { name: 'walk', overlay: { source: 'holding-right', bones: ['arm-right'] } },
          { name: 'shoot', source: 'holding-right-shoot', loop: false },
          { name: 'die', loop: false },
        ],
        attachments: [{ bone: 'arm-right', geometry: orbGeometry(), material: 1, glow: 1.6 }],
        extraMaterials: [new MeshLambertMaterial({ vertexColors: true, flatShading: true })],
      });
    case 'goblin':
      return bakeGltf(assets.model('dungeon/character-orc'), {
        height: 1.2,
        clips: [
          { name: 'walk', source: 'sprint' },
          { name: 'die', loop: false },
        ],
        attachments: [{ bone: 'arm-left', geometry: sackGeometry(), material: 1, glow: 0.35 }],
        extraMaterials: [new MeshLambertMaterial({ vertexColors: true, flatShading: true })],
      });
    case 'archer':
      return bakeGltf(assets.model('dungeon/character-orc'), {
        height: 1.9,
        clips: [
          { name: 'walk', overlay: { source: 'holding-right', bones: ['arm-right'] } },
          { name: 'shoot', source: 'holding-right-shoot', loop: false },
          { name: 'die', loop: false },
        ],
        attachments: [{ bone: 'arm-right', geometry: bowGeometry(), material: 1 }],
        extraMaterials: [new MeshLambertMaterial({ vertexColors: true, flatShading: true })],
      });
    default:
      return null;
  }
}

const STRIDE: Record<string, number> = {
  slime: 1.6,
  skeleton: 2.1,
  bat: 2,
  exploder: 1.4,
  archer: 2.3,
  golem: 2.2,
  zombie: 1.7,
  ghost: 2.6,
  vampire: 2.3,
  keeper: 2,
  goblin: 2.4,
};

/** Hayalet yarı saydam ve hafif ışıklı (gece de seçilsin). */
function makeGhostly(mat: Material | Material[]): void {
  for (const m of Array.isArray(mat) ? mat : [mat]) {
    m.transparent = true;
    m.opacity = 0.62;
    m.depthWrite = false;
    if (m instanceof MeshLambertMaterial) m.emissive.setHex(0x2a2c55);
  }
}

export function buildEnemyLooks(assets: GameAssets, capacity: number): (EnemyLook | null)[] {
  return ENEMIES.map((def) => {
    // Boss'lar başka türün rig'ini (büyütülmüş) kullanır; sahnede en fazla birkaç tane olur.
    const base = def.model ?? def.id;
    const rig = bake(assets, base, def.hover);
    if (!rig) return null;
    const crowd = new CrowdMesh(rig, def.role === 'boss' ? 8 : capacity);
    crowd.name = `enemy:${def.id}`;
    if (def.behavior === 'phase') makeGhostly(crowd.material);
    return {
      crowd,
      walk: crowd.clip('walk'),
      die: crowd.clip('die'),
      shoot: rig.clips.shoot,
      fuse: rig.clips.fuse,
      windup: rig.clips.windup,
      dash: rig.clips.dash,
      stride: STRIDE[base] ?? 2,
    };
  });
}
