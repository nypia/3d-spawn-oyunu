/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type BufferAttribute, Mesh, SkinnedMesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';

const ROOT = 'src/assets/models';

function glbFiles(): string[] {
  return readdirSync(ROOT).flatMap((kit) =>
    readdirSync(join(ROOT, kit))
      .filter((f) => f.endsWith('.glb'))
      .map((f) => join(kit, f)),
  );
}

function glbJson(path: string): { images?: unknown; buffers?: { uri?: string }[] } {
  const b = readFileSync(join(ROOT, path));
  const len = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
}

async function parse(path: string) {
  const b = readFileSync(join(ROOT, path));
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  return new GLTFLoader().parseAsync(ab, '');
}

const CHARACTER_CLIPS = ['static', 'idle', 'walk', 'sprint', 'jump', 'fall', 'crouch', 'die'];

describe('gömülü modeller', () => {
  it('her GLB dış dosyaya bağlı değil (doku/ikili veri gömülü ya da yok)', () => {
    const files = glbFiles();
    expect(files.length).toBeGreaterThan(40);
    for (const f of files) {
      const j = glbJson(f);
      expect(j.images, f).toBeUndefined();
      for (const buf of j.buffers ?? []) expect(buf.uri, f).toBeUndefined();
    }
  });

  it('karakterler gereken animasyonlara sahip ve her vertex tek kemiğe bağlı', async () => {
    const chars = glbFiles().filter((f) => f.includes('character-'));
    expect(chars.length).toBeGreaterThanOrEqual(6);
    for (const f of chars) {
      const gltf = await parse(f);
      const names = gltf.animations.map((a) => a.name);
      for (const c of CHARACTER_CLIPS) expect(names, `${f}: ${c}`).toContain(c);
      gltf.scene.traverse((o) => {
        if (!(o instanceof SkinnedMesh)) return;
        const w = o.geometry.getAttribute('skinWeight') as BufferAttribute;
        for (let i = 0; i < w.count; i++) {
          // Tek kemik: en büyük ağırlık ~1, diğerleri ~0.
          const max = Math.max(w.getX(i), w.getY(i), w.getZ(i), w.getW(i));
          expect(max, f).toBeGreaterThan(0.999);
        }
      });
    }
    const orc = await parse('dungeon/character-orc.glb');
    expect(orc.animations.map((a) => a.name)).toContain('holding-right-shoot');
  });

  it('doğa modelleri ayrıştırılır ve mesh içerir', async () => {
    for (const f of glbFiles().filter((x) => x.startsWith('nature'))) {
      const gltf = await parse(f);
      let meshes = 0;
      gltf.scene.traverse((o) => {
        if (o instanceof Mesh) meshes++;
      });
      expect(meshes, f).toBeGreaterThan(0);
    }
  });
});
