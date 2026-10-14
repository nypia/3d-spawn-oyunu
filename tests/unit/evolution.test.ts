import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/Rng';
import { BALANCE } from '../../src/data/balance';
import { ENEMY_INDEX } from '../../src/data/enemies';
import { EVOLUTION_BY_WEAPON, EVOLUTIONS } from '../../src/data/evolutions';
import { TOME_INDEX, TOMES } from '../../src/data/tomes';
import { WEAPON_INDEX, WEAPONS, weaponMaxLevel } from '../../src/data/weapons';
import { NO_INPUT } from '../../src/sim/player/Player';
import { describeUpgrade, rollUpgrades } from '../../src/sim/progression/Upgrades';
import { CHEST } from '../../src/sim/world/Interactables';
import { World } from '../../src/sim/world/World';

const DT = BALANCE.simStep;

function arena(start = 'magicBolt'): World {
  return new World({ seed: 31, enemyCap: 0, startWeapon: start });
}

function maxOut(w: World, slot = 0): void {
  const weapon = WEAPON_INDEX[w.weapons[slot].def.id];
  while (w.weapons[slot].level < weaponMaxLevel(w.weapons[slot].def)) {
    w.applyUpgrade({ kind: 'weaponLevel', weapon, toLevel: w.weapons[slot].level + 1, rarity: 0 });
  }
}

function giveTome(w: World, id: string): void {
  w.applyUpgrade({ kind: 'tome', tome: TOME_INDEX[id], toLevel: 1, rarity: 0 });
}

/** İlk sandığı açar (yeterli altınla üstüne yürür). */
function openChest(w: World): void {
  const it = w.interactables;
  let c = -1;
  for (let i = 0; i < it.count && c < 0; i++) if (it.kind[i] === CHEST && !it.used[i]) c = i;
  w.gold = 1000;
  w.player.x = it.x[c];
  w.player.z = it.z[c];
  w.player.y = w.terrain.heightAt(it.x[c], it.z[c]);
  w.step(NO_INPUT, DT);
}

describe('evrim tanımları', () => {
  it('8 evrim; her silah ve kitap bir kez eşleşir', () => {
    expect(EVOLUTIONS).toHaveLength(8);
    expect(new Set(EVOLUTIONS.map((e) => e.weapon)).size).toBe(WEAPONS.length);
    expect(new Set(EVOLUTIONS.map((e) => e.tome)).size).toBe(TOMES.length);
    for (const e of EVOLUTIONS) {
      const base = WEAPONS[WEAPON_INDEX[e.weapon]];
      expect(e.def.behavior).toBe(base.behavior);
      expect(e.def.evolvesFrom).toBe(base.id);
      expect(e.def.base.damage).toBeGreaterThan(base.base.damage);
      expect(e.def.base.cooldown).toBeLessThanOrEqual(base.base.cooldown);
    }
  });
});

describe('evrim koşulu', () => {
  it('kitap yoksa sandık eşya verir', () => {
    const w = arena();
    maxOut(w);
    openChest(w);
    expect(w.reward?.kind).toBe('item');
  });

  it('silah maks değilse sandık eşya verir', () => {
    const w = arena();
    giveTome(w, 'fury');
    openChest(w);
    expect(w.reward?.kind).toBe('item');
  });

  it('maks silah + eşleşen kitap → sandık evrim verir, silah güçlenir', () => {
    const w = arena();
    maxOut(w);
    giveTome(w, 'fury');
    const before = { ...w.weapons[0].stats };
    openChest(w);
    expect(w.reward).toEqual({ kind: 'evolution', slot: 0 });
    w.takeReward();
    const evolved = w.weapons[0];
    expect(evolved.def.id).toBe('holyWand');
    expect(evolved.stats.damage).toBeGreaterThan(before.damage);
    expect(evolved.stats.cooldown).toBeLessThan(before.cooldown);
    // Alınmış yükseltmeler korunur (Büyü Oku seviyelerinden +3 mermi).
    expect(evolved.stats.count).toBe(evolved.def.base.count + 3);
    expect(w.canEvolve(evolved)).toBe(false);
    expect(w.findEvolution()).toBe(-1);
  });

  it('elitin ücretsiz sandığı da evrim verir', () => {
    const w = arena('sword');
    maxOut(w);
    giveTome(w, 'power');
    const before = w.interactables.count;
    const i = w.spawnEnemy(ENEMY_INDEX.skeleton, w.player.x + 10, w.player.z, true);
    w.damageEnemy(i, 1e7, 0, 0);
    const it = w.interactables;
    w.player.x = it.x[before];
    w.player.z = it.z[before];
    w.player.y = w.terrain.heightAt(it.x[before], it.z[before]);
    w.step(NO_INPUT, DT);
    expect(w.reward?.kind).toBe('evolution');
    w.takeReward();
    expect(w.weapons[0].def.id).toBe('bloodBlade');
  });

  it('evrimleşen silah yuvasını tutar; temel silah yeniden önerilmez', () => {
    const w = arena();
    maxOut(w);
    giveTome(w, 'fury');
    w.evolveWeapon(0);
    const rng = new Rng(4);
    for (let k = 0; k < 200; k++) {
      for (const o of rollUpgrades(w, rng)) {
        expect(o.kind === 'weaponNew' && WEAPONS[o.weapon].id === 'magicBolt').toBe(false);
        expect(o.kind === 'weaponLevel' && WEAPONS[o.weapon].id === 'magicBolt').toBe(false);
      }
    }
  });

  it('maks seviye kartı evrim tarifini gösterir', () => {
    const evo = EVOLUTION_BY_WEAPON.magicBolt;
    const view = describeUpgrade({
      kind: 'weaponLevel',
      weapon: WEAPON_INDEX.magicBolt,
      toLevel: weaponMaxLevel(WEAPONS[WEAPON_INDEX.magicBolt]),
      rarity: 0,
    });
    expect(view.hint).toContain(TOMES[TOME_INDEX[evo.tome]].name);
    const mid = describeUpgrade({
      kind: 'weaponLevel',
      weapon: WEAPON_INDEX.magicBolt,
      toLevel: 3,
      rarity: 0,
    });
    expect(mid.hint).toBeUndefined();
  });

  it('evrimleşmiş silahlar headless çalışır (her davranış)', () => {
    for (const evo of EVOLUTIONS) {
      const w = new World({ seed: 9, startWeapon: evo.weapon, godMode: true });
      maxOut(w);
      giveTome(w, evo.tome);
      w.evolveWeapon(0);
      expect(w.weapons[0].def.id).toBe(evo.def.id);
      w.spawnBurst(60, 3, 12);
      for (let t = 0; t < 5; t += DT) {
        while (w.offer || w.reward) {
          if (w.reward) w.takeReward();
          else w.choose(0);
        }
        w.step(NO_INPUT, DT);
      }
      expect(w.kills).toBeGreaterThan(0);
      expect(w.tintOf(evo.def.behavior)).toBe(evo.def.tint);
    }
  });
});
