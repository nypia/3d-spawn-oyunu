import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { HEROES } from '../../src/data/heroes';
import { META_UPGRADES } from '../../src/data/metaUpgrades';
import { WEAPON_INDEX } from '../../src/data/weapons';
import { NO_INPUT } from '../../src/sim/player/Player';
import { World } from '../../src/sim/world/World';

describe('kahraman ve kalıcı güçler', () => {
  it('her kahraman kendi silahıyla başlar ve pasifini alır', () => {
    for (const hero of HEROES) {
      const w = new World({ seed: 3, loadout: { hero: hero.id } });
      expect(w.weapons[0].def.id, hero.id).toBe(hero.weapon);
      expect(WEAPON_INDEX[hero.weapon]).toBeDefined();
    }
    const can = new World({ seed: 3, loadout: { hero: 'can' } });
    expect(can.player.maxHp).toBe(BALANCE.player.baseHp + 20);
    expect(can.stats.get('armor')).toBe(1);
    const bora = new World({ seed: 3, loadout: { hero: 'bora' } });
    expect(bora.stats.get('jumpCount')).toBeGreaterThan(new World({ seed: 3 }).stats.get('jumpCount'));
  });

  it('startWeapon kahramanı ezer (testler için)', () => {
    const w = new World({ seed: 3, startWeapon: 'mortar', loadout: { hero: 'can' } });
    expect(w.weapons[0].def.id).toBe('mortar');
  });

  it('güç rank etkileri: can, hak, altın; bilinmeyen ve aşırı rank yok sayılır', () => {
    const w = new World({
      seed: 4,
      loadout: { upgrades: { vigor: 3, reroll: 2, exile: 1, greed: 2, hacked: 9, armor: 99 } },
    });
    expect(w.player.maxHp).toBe(BALANCE.player.baseHp + 30);
    expect(w.rerolls).toBe(2 + 2);
    expect(w.banishes).toBe(1 + 1);
    expect(w.skips).toBe(1 + 1);
    expect(w.gold).toBe(30);
    const armorMax = META_UPGRADES.find((u) => u.id === 'armor')?.costs.length ?? 0;
    expect(w.stats.get('armor')).toBe(armorMax);
  });

  it('aynı seed + aynı loadout → aynı koşu (60 sn)', () => {
    const run = () => {
      const w = new World({ seed: 77, loadout: { hero: 'su', upgrades: { might: 2, fortune: 1 } } });
      for (let s = 0; s < 3600 && !w.gameOver; s++) {
        while (w.offer) w.choose(0);
        while (w.reward) w.takeReward(0);
        w.step(NO_INPUT, BALANCE.simStep);
      }
      return [w.kills, w.level, Math.round(w.damageDealt), w.player.hp.toFixed(3), w.enemies.count];
    };
    expect(run()).toEqual(run());
  });
});
