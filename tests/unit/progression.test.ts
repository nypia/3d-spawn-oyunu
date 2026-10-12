import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/Rng';
import { xpToNext } from '../../src/data/balance';
import { TOMES } from '../../src/data/tomes';
import { WEAPONS } from '../../src/data/weapons';
import { rollUpgrades } from '../../src/sim/progression/Upgrades';
import { Stats } from '../../src/sim/stats/Stats';
import { computeWeaponStats } from '../../src/sim/weapons/Weapons';
import { World } from '../../src/sim/world/World';

describe('XP eğrisi', () => {
  it('kesin artan', () => {
    for (let l = 1; l < 60; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
  });
});

describe('Stats', () => {
  it('(taban + add) × (1 + mult)', () => {
    const s = new Stats({ moveSpeed: 10 });
    s.addFlat('moveSpeed', 2);
    s.addMult('moveSpeed', 0.5);
    expect(s.get('moveSpeed')).toBeCloseTo(18);
    expect(s.get('damage')).toBe(1);
  });
});

describe('Silah seviyeleri', () => {
  it('Büyü Oku seviye 2 bir mermi ekler', () => {
    const bolt = WEAPONS.find((w) => w.id === 'magicBolt')!;
    expect(computeWeaponStats(bolt, 2).count).toBe(bolt.base.count + 1);
  });
});

describe('rollUpgrades', () => {
  it('tekrarsız 3 kart verir ve slot sınırına uyar', () => {
    const world = new World({ seed: 5 });
    const rng = new Rng(11);
    for (let t = 0; t < 50; t++) {
      const opts = rollUpgrades(world, rng);
      expect(opts).toHaveLength(3);
      const keys = opts.map((o) => JSON.stringify(o));
      expect(new Set(keys).size).toBe(3);
    }
  });

  it('maks seviyedeki kitap tekrar önerilmez', () => {
    const world = new World({ seed: 5 });
    const i = TOMES.findIndex((t) => t.id === 'multiply');
    world.tomeLevels[i] = TOMES[i].maxLevel;
    const rng = new Rng(2);
    for (let t = 0; t < 200; t++) {
      for (const o of rollUpgrades(world, rng)) expect(o.kind === 'tome' && o.tome === i).toBe(false);
    }
  });
});
