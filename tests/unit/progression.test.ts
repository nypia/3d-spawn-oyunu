import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/Rng';
import { BALANCE, xpToNext } from '../../src/data/balance';
import { TOMES } from '../../src/data/tomes';
import { WEAPONS } from '../../src/data/weapons';
import {
  describeUpgrade,
  rollUpgrades,
  slotUsage,
  type UpgradeOption,
} from '../../src/sim/progression/Upgrades';
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
    expect(computeWeaponStats(bolt, [{ delta: bolt.levels[0], mult: 1 }]).count).toBe(bolt.base.count + 1);
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

  it('200 seviye atlamada en fazla 4 silah + 4 kitap; dolunca yalnızca sahip olunanlar güçlenir', () => {
    const world = new World({ seed: 8, enemyCap: 0 });
    const { weaponSlots, tomeSlots } = BALANCE.levelUp;
    let fullOffers = 0;
    for (let n = 0; n < 200; n++) {
      world.addXp(world.xpNext - world.xp);
      world.step({ moveX: 0, moveZ: 0, jump: false, slide: false }, BALANCE.simStep);
      while (world.offer) {
        const slots = slotUsage(world);
        const isNew = (o: UpgradeOption) => o.kind === 'weaponNew' || (o.kind === 'tome' && o.toLevel === 1);
        if (slots.weapons >= weaponSlots) {
          expect(world.offer.some((o) => o.kind === 'weaponNew')).toBe(false);
        }
        if (slots.tomes >= tomeSlots) {
          expect(world.offer.some((o) => o.kind === 'tome' && o.toLevel === 1)).toBe(false);
        }
        if (slots.weapons >= weaponSlots && slots.tomes >= tomeSlots) fullOffers++;
        // Açgözlü bot: hep yeni silah/kitabı seçer, yuvaları zorlar.
        const i = world.offer.findIndex(isNew);
        world.choose(i >= 0 ? i : 0);
        const after = slotUsage(world);
        expect(after.weapons).toBeLessThanOrEqual(weaponSlots);
        expect(after.tomes).toBeLessThanOrEqual(tomeSlots);
      }
    }
    expect(slotUsage(world)).toEqual({ weapons: weaponSlots, tomes: tomeSlots });
    expect(fullOffers).toBeGreaterThan(100);
  });

  it('yeni silah kartı kaçıncı yuvaya gireceğini yazar', () => {
    const view = describeUpgrade({ kind: 'weaponNew', weapon: 1 }, { weapons: 2, tomes: 0 });
    expect(view.badge).toBe(`YENİ SİLAH · 3/${BALANCE.levelUp.weaponSlots}`);
    const tome = describeUpgrade({ kind: 'tome', tome: 0, toLevel: 1, rarity: 0 }, { weapons: 2, tomes: 3 });
    expect(tome.badge).toBe(`YENİ KİTAP · 4/${BALANCE.levelUp.tomeSlots}`);
  });
});
