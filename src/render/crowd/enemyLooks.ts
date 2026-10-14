import { CylinderGeometry, MeshLambertMaterial, TorusGeometry } from 'three';
import { ENEMIES } from '../../data/enemies';
import type { GameAssets } from '../assets/loadAssets';
import { build } from '../shapes';
import { type BakedClip, type BakedRig, bakeGltf } from './bakeRig';
import { CrowdMesh } from './CrowdMesh';

/**
 * Düşman türü → animasyonlu kalabalık modeli. Henüz model atanmamış türler (null) WorldView'daki
 * prosedürel şekillerle çizilir.
 */
export interface EnemyLook {
  crowd: CrowdMesh;
  walk: BakedClip;
  die: BakedClip;
  /** Okçu: yay çekme/atış klibi. */
  shoot?: BakedClip;
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

function bake(assets: GameAssets, id: string): BakedRig | null {
  switch (id) {
    case 'skeleton':
      return bakeGltf(assets.model('graveyard/character-skeleton'), {
        height: 1.75,
        clips: [{ name: 'walk' }, { name: 'die', loop: false }],
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

const STRIDE: Record<string, number> = { skeleton: 2.1, archer: 2.3 };

export function buildEnemyLooks(assets: GameAssets, capacity: number): (EnemyLook | null)[] {
  return ENEMIES.map((def) => {
    const rig = bake(assets, def.id);
    if (!rig) return null;
    const crowd = new CrowdMesh(rig, capacity);
    crowd.name = `enemy:${def.id}`;
    return {
      crowd,
      walk: crowd.clip('walk'),
      die: crowd.clip('die'),
      shoot: rig.clips.shoot,
      stride: STRIDE[def.id] ?? 2,
    };
  });
}
