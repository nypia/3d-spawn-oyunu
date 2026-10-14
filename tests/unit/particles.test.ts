import { BoxGeometry, MeshBasicMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Debris } from '../../src/render/fx/Debris';
import { Particles } from '../../src/render/fx/Particles';
import type { Heightmap } from '../../src/sim/terrain/Heightmap';

const flat = { heightAt: () => 0 } as unknown as Heightmap;
const farCamera = new Vector3(0, 100, 0);

describe('Particles', () => {
  it('ömrü biten parçacıklar havuzdan düşer', () => {
    const p = new Particles(16);
    for (let i = 0; i < 5; i++) p.emit({ x: 0, y: 0, z: 0, life: 0.2 + i * 0.1, size: 1, r: 1, g: 1, b: 1 });
    p.update(0.25);
    expect(p.count).toBe(4);
    expect(p.batch.count).toBe(4);
    p.update(1);
    expect(p.count).toBe(0);
    expect(p.batch.mesh.visible).toBe(false);
  });

  it('havuz dolunca en eskinin üstüne yazar, büyümez', () => {
    const p = new Particles(8);
    for (let i = 0; i < 20; i++) p.emit({ x: i, y: 0, z: 0, life: 1, size: 1, r: 1, g: 1, b: 1 });
    expect(p.count).toBe(8);
    p.update(0.01);
    expect(p.batch.count).toBe(8);
  });

  it('yerçekimi ve sönüm hızı değiştirir', () => {
    const p = new Particles(4);
    p.emit({ x: 0, y: 10, z: 0, vx: 4, life: 5, size: 1, r: 1, g: 1, b: 1, gravity: 10, drag: 1 });
    for (let i = 0; i < 30; i++) p.update(1 / 60);
    const pos = p.batch.mesh.geometry.getAttribute('iPos');
    expect(pos.getY(0)).toBeLessThan(10);
    expect(pos.getX(0)).toBeGreaterThan(0);
    expect(pos.getX(0)).toBeLessThan(2);
  });
});

describe('Debris', () => {
  it('parçalar zemine düşüp durur ve ömür sonunda kaybolur', () => {
    const d = new Debris(new BoxGeometry(), new MeshBasicMaterial(), 8);
    d.emit(0, 2, 0, 1, 5, 0, 0.2, 0xff0000, 2, 10);
    for (let i = 0; i < 90; i++) d.update(flat, 1 / 60, farCamera);
    expect(d.mesh.count).toBe(1);
    const m = d.mesh.instanceMatrix.array;
    // Zeminin altına inmez (boyun bir kısmı kadar yukarıda durur).
    expect(m[13]).toBeGreaterThanOrEqual(0);
    expect(m[13]).toBeLessThan(0.2);
    for (let i = 0; i < 90; i++) d.update(flat, 1 / 60, farCamera);
    expect(d.mesh.count).toBe(0);
  });

  it('kameranın dibindeki parçalar çizilmez', () => {
    const d = new Debris(new BoxGeometry(), new MeshBasicMaterial(), 8);
    d.emit(0, 5, 0, 0, 0, 0, 0.2, 0xffffff, 2, 0);
    d.update(flat, 1 / 60, new Vector3(0, 5, 0.5));
    expect(d.mesh.count).toBe(0);
    d.update(flat, 1 / 60, farCamera);
    expect(d.mesh.count).toBe(1);
  });
});
