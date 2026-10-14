/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { BoxGeometry, type BufferAttribute, Matrix4, MeshLambertMaterial, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { type BakedRig, bakeGltf, bakeProcedural } from '../../src/render/crowd/bakeRig';
import { batRig, bombRig, golemRig, slimeRig } from '../../src/render/crowd/proceduralRigs';

async function model(path: string) {
  const b = readFileSync(`src/assets/models/${path}.glb`);
  const gltf = await new GLTFLoader().parseAsync(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    '',
  );
  return { scene: gltf.scene, animations: gltf.animations };
}

/** Pişmiş rig'i CPU'da shader gibi uygular: verilen satırdaki pozun sınır kutusu yüksekliği. */
function posedHeight(rig: BakedRig, row: number): number {
  const data = rig.texture.image.data as Float32Array;
  const pos = rig.geometry.getAttribute('position') as BufferAttribute;
  const bone = rig.geometry.getAttribute('aBone') as BufferAttribute;
  const m = new Matrix4();
  const v = new Vector3();
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < pos.count; i++) {
    const b = Math.round(bone.getX(i));
    m.fromArray(data, (row * rig.bones * 4 + b * 4) * 4);
    v.fromBufferAttribute(pos, i).applyMatrix4(m);
    min = Math.min(min, v.y);
    max = Math.max(max, v.y);
  }
  return max - Math.min(0, min);
}

function allFinite(rig: BakedRig): boolean {
  return (rig.texture.image.data as Float32Array).every((x) => Number.isFinite(x));
}

describe('bakeRig', () => {
  it('parça hiyerarşisi (iskelet): hedef boyda, kemik indeksleri geçerli', async () => {
    const rig = bakeGltf(await model('graveyard/character-skeleton'), {
      height: 1.75,
      clips: [{ name: 'static', loop: false }, { name: 'walk' }, { name: 'die', loop: false }],
    });
    expect(rig.bones).toBe(6);
    expect(rig.clips.walk.frames).toBe(20);
    expect(rig.texture.image.width).toBe(rig.bones * 4);
    expect(allFinite(rig)).toBe(true);
    const bone = rig.geometry.getAttribute('aBone') as BufferAttribute;
    for (let i = 0; i < bone.count; i++) expect(bone.getX(i)).toBeLessThan(rig.bones);
    expect(posedHeight(rig, rig.clips.static.start)).toBeCloseTo(1.75, 1);
  });

  it('skinned mesh + ek parça (ork + yay): hedef boyda ve iki materyal grubu', async () => {
    const bow = new BoxGeometry(0.1, 0.8, 0.1);
    const rig = bakeGltf(await model('dungeon/character-orc'), {
      height: 1.9,
      clips: [
        { name: 'static', loop: false },
        { name: 'walk', overlay: { source: 'holding-right', bones: ['arm-right'] } },
      ],
      attachments: [{ bone: 'arm-right', geometry: bow, material: 1 }],
      extraMaterials: [new MeshLambertMaterial()],
    });
    expect(rig.bones).toBe(15);
    expect(rig.materials).toHaveLength(2);
    expect(rig.geometry.groups.some((g) => g.materialIndex === 1)).toBe(true);
    expect(allFinite(rig)).toBe(true);
    // Yay elden dışarı taşsa da boy ≈ hedef (yay omuz hizasında, baştan alçakta).
    expect(posedHeight(rig, rig.clips.static.start)).toBeCloseTo(1.9, 1);
  });

  it('prosedürel rig: poz fonksiyonu dokuya yazılır', () => {
    const rig = bakeProcedural({
      bones: 2,
      parts: [
        { geometry: new BoxGeometry(1, 1, 1), bone: 0 },
        { geometry: new BoxGeometry(0.2, 0.2, 0.2).translate(0, 1, 0), bone: 1, glow: 1 },
      ],
      clips: [
        {
          name: 'bob',
          duration: 1,
          pose: (t, bones) => {
            bones[1].makeTranslation(0, Math.sin(t * Math.PI * 2), 0);
          },
        },
      ],
      materials: [new MeshLambertMaterial()],
      height: 1,
    });
    expect(rig.clips.bob.frames).toBe(30);
    const data = rig.texture.image.data as Float32Array;
    // 8. karede (t≈0.267) 1. kemiğin y ötelemesi sin(2π·0.267) ≈ 0.995.
    const row = 8;
    const ty = data[(row * rig.bones * 4 + 1 * 4) * 4 + 13];
    expect(ty).toBeCloseTo(Math.sin((8 / 30) * Math.PI * 2), 4);
    const glow = rig.geometry.getAttribute('aGlow') as BufferAttribute;
    expect(glow.getX(glow.count - 1)).toBe(1);
  });

  it("el yapımı düşman rig'leri pişer: sonlu matrisler, gereken klipler, makul boy", () => {
    const rigs = { slime: slimeRig(), bat: batRig(1.4), exploder: bombRig(), golem: golemRig() };
    for (const [name, def] of Object.entries(rigs)) {
      const rig = bakeProcedural(def);
      expect(allFinite(rig), name).toBe(true);
      expect(rig.clips.walk, name).toBeDefined();
      expect(rig.clips.die, name).toBeDefined();
      expect(rig.clips.die.loop, name).toBe(false);
      const h = posedHeight(rig, rig.clips.walk.start);
      expect(h, name).toBeGreaterThan(0.3);
      expect(h, name).toBeLessThan(3);
    }
    expect(bakeProcedural(rigs.exploder).clips.fuse).toBeDefined();
  });
});
