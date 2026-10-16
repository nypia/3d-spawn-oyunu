import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { ENEMY_INDEX } from '../../src/data/enemies';
import { ITEM_INDEX } from '../../src/data/items';
import { WEAPON_INDEX } from '../../src/data/weapons';
import { Blasts } from '../../src/sim/combat/Blasts';
import { ProjectilePool } from '../../src/sim/combat/ProjectilePool';
import { NO_INPUT } from '../../src/sim/player/Player';
import { summarizeRun } from '../../src/sim/world/RunStats';
import { World } from '../../src/sim/world/World';

const DT = BALANCE.simStep;

function arena(): World {
  const w = new World({ seed: 31, enemyCap: 0, godMode: true });
  w.landmarks.goblinAt = 1e9;
  w.bosses.next = 99;
  w.applyUpgrade({ kind: 'weaponNew', weapon: WEAPON_INDEX.fireAura });
  w.applyUpgrade({ kind: 'weaponNew', weapon: WEAPON_INDEX.mortar });
  return w;
}

describe('hasar kaynakları', () => {
  it('silah yuvalarının ve "diğer"in toplamı toplam hasara eşittir; her silah hasar verir', () => {
    const w = arena();
    for (let s = 0; s < 6 * 60; s++) {
      if (s % 30 === 0) {
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          w.spawnEnemy(ENEMY_INDEX.zombie, w.player.x + Math.sin(a) * 3, w.player.z + Math.cos(a) * 3);
        }
      }
      w.step(NO_INPUT, DT);
    }
    const r = w.run;
    const sum = r.otherDamage + w.weapons.reduce((a, _, k) => a + r.weaponDamage[k], 0);
    expect(sum).toBeCloseTo(w.damageDealt, 3);
    for (let k = 0; k < w.weapons.length; k++)
      expect(r.weaponDamage[k], w.weapons[k].def.id).toBeGreaterThan(0);
    const kills = r.otherKills + w.weapons.reduce((a, _, k) => a + r.weaponKills[k], 0);
    expect(kills).toBe(w.kills);
    expect(w.dmgSrc).toBe(-1);
  });

  it('Kafatası patlaması silaha değil "diğer"e yazılır', () => {
    const w = new World({ seed: 32, enemyCap: 0, godMode: true });
    w.weapons.length = 0;
    w.itemCounts[ITEM_INDEX.skull] = 50;
    const a = w.spawnEnemy(ENEMY_INDEX.slime, w.player.x + 8, w.player.z);
    w.spawnEnemy(ENEMY_INDEX.zombie, w.player.x + 8.5, w.player.z);
    w.dmgSrc = 0;
    w.damageEnemy(a, 1e9, 0, 0);
    w.dmgSrc = -1;
    expect(w.run.weaponKills[0]).toBe(1);
    const before = w.run.weaponDamage[0];
    for (let s = 0; s < 10; s++) w.step(NO_INPUT, DT);
    expect(w.run.weaponDamage[0]).toBe(before);
    expect(w.run.otherDamage).toBeGreaterThan(0);
  });

  it('koşu özeti silahları hasara göre sıralar, payları 1 eder', () => {
    const w = arena();
    w.run.weaponDamage[0] = 100;
    w.run.weaponDamage[1] = 300;
    w.run.weaponDamage[2] = 50;
    w.run.otherDamage = 50;
    w.time = 120;
    const s = summarizeRun(w);
    expect(s.weapons.map((x) => x.damage)).toEqual([300, 100, 50]);
    expect(s.weapons.reduce((a, x) => a + x.share, 0) + 50 / 500).toBeCloseTo(1, 6);
    expect(s.outcome).toBe('death');
    w.finishRun('victory');
    expect(summarizeRun(w).outcome).toBe('victory');
    expect(w.gameOver).toBe(true);
  });
});

describe('havuzlar', () => {
  it('mermi havuzu swap-remove ile kaynağı (src) korur', () => {
    const pr = new ProjectilePool(4);
    for (let k = 0; k < 3; k++) {
      const i = pr.add();
      pr.src[i] = k;
      pr.damage[i] = 10 + k;
    }
    pr.removeAt(0);
    expect(pr.count).toBe(2);
    expect(pr.src[0]).toBe(2);
    expect(pr.damage[0]).toBe(12);
    expect(pr.add()).toBe(2);
    expect(pr.src[2]).toBe(-1);
  });

  it('patlama havuzu swap-remove ile kaynağı korur', () => {
    const b = new Blasts(4);
    b.add(0, 0, 1, 1, 0, 1, 0);
    b.add(1, 0, 1, 1, 0, 1, 3);
    b.removeAt(0);
    expect(b.src[0]).toBe(3);
    expect(b.x[0]).toBe(1);
  });
});
