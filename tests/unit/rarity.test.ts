import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/Rng';
import { BALANCE } from '../../src/data/balance';
import { TOME_INDEX } from '../../src/data/tomes';
import { describeDelta, WEAPON_INDEX, WEAPONS } from '../../src/data/weapons';
import { NO_INPUT } from '../../src/sim/player/Player';
import { rollRarity } from '../../src/sim/progression/Rarity';
import { rollUpgrades, upgradeKey } from '../../src/sim/progression/Upgrades';
import { World } from '../../src/sim/world/World';

function share(luck: number, rarity: number): number {
  const rng = new Rng(3);
  let hits = 0;
  const n = 20000;
  for (let i = 0; i < n; i++) if (rollRarity(rng, luck) === rarity) hits++;
  return hits / n;
}

/** Dünyayı seviye atlama ekranına getirir. */
function worldWithOffer(seed = 1): World {
  const w = new World({ seed });
  w.addXp(w.xpNext);
  w.step(NO_INPUT, BALANCE.simStep);
  expect(w.offer).not.toBeNull();
  return w;
}

describe('nadirlik', () => {
  it('şans 0 iken dağılım taban ağırlıklara yakın', () => {
    expect(share(0, 0)).toBeCloseTo(0.6, 1);
    expect(share(0, 3)).toBeGreaterThan(0.025);
    expect(share(0, 3)).toBeLessThan(0.055);
  });

  it('şans efsanevi ihtimalini artırır', () => {
    expect(share(1, 3)).toBeGreaterThan(share(0, 3) * 2);
  });

  it('epik kitap bonusu iki katı uygular', () => {
    const w = new World({ seed: 2 });
    w.applyUpgrade({ kind: 'tome', tome: TOME_INDEX.power, toLevel: 1, rarity: 2 });
    expect(w.stats.get('damage')).toBeCloseTo(1.3);
  });

  it('efsanevi silah yükseltmesi hasarı üç kat artırır', () => {
    const w = new World({ seed: 2 });
    const bolt = w.weapons[0];
    w.applyUpgrade({ kind: 'weaponLevel', weapon: WEAPON_INDEX.magicBolt, toLevel: 2, rarity: 0 });
    w.applyUpgrade({ kind: 'weaponLevel', weapon: WEAPON_INDEX.magicBolt, toLevel: 3, rarity: 3 });
    expect(bolt.level).toBe(3);
    expect(bolt.stats.damage).toBeCloseTo(WEAPONS[WEAPON_INDEX.magicBolt].base.damage + 6 * 3);
  });

  it('delta açıklaması çarpanı yansıtır', () => {
    expect(describeDelta({ damage: 6, cooldownPct: 0.1 }, 1.5)).toBe('+9 hasar, bekleme −%15');
  });
});

describe('yenile / yasakla / atla', () => {
  it('yenile hak harcar ve hak bitince çalışmaz', () => {
    const w = worldWithOffer();
    expect(w.reroll()).toBe(true);
    expect(w.reroll()).toBe(true);
    expect(w.rerolls).toBe(0);
    expect(w.reroll()).toBe(false);
  });

  it('yasaklanan kart bir daha çıkmaz', () => {
    const w = worldWithOffer();
    const key = upgradeKey(w.offer![0]);
    expect(w.banish(0)).toBe(true);
    expect(w.banished.has(key)).toBe(true);
    expect(w.offer!.map(upgradeKey)).not.toContain(key);
    const rng = new Rng(9);
    for (let i = 0; i < 300; i++) expect(rollUpgrades(w, rng).map(upgradeKey)).not.toContain(key);
    expect(w.banish(0)).toBe(false);
  });

  it('atla altın verir ve oyunu devam ettirir', () => {
    const w = worldWithOffer();
    expect(w.skip()).toBe(true);
    expect(w.gold).toBe(5);
    expect(w.offer).toBeNull();
    expect(w.paused).toBe(false);
    expect(w.skip()).toBe(false);
  });
});
