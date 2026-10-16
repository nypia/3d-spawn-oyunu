import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { ENEMY_INDEX } from '../../src/data/enemies';
import { EVOLUTION_BY_WEAPON, EVOLUTIONS } from '../../src/data/evolutions';
import { WEAPON_INDEX, WEAPONS } from '../../src/data/weapons';
import { PF_CHILD, PF_WHIRLED } from '../../src/sim/combat/ProjectilePool';
import { EF_BOSS } from '../../src/sim/enemies/EnemyPool';
import { NO_INPUT } from '../../src/sim/player/Player';
import { createWeapon, orbitRadius } from '../../src/sim/weapons/Weapons';
import { HIT_EXECUTE, PULSE_DRAIN, PULSE_VOID, World } from '../../src/sim/world/World';

const DT = BALANCE.simStep;

/** Düşmansız dünya; tek silah: verilen evrim (ya da temel silah). */
function withWeapon(id: string, evolved = true, seed = 40): World {
  const w = new World({ seed, enemyCap: 0, godMode: true });
  w.landmarks.goblinAt = 1e9;
  w.bosses.next = 99;
  w.weapons.length = 0;
  const def = evolved ? EVOLUTION_BY_WEAPON[id].def : WEAPONS[WEAPON_INDEX[id]];
  w.weapons.push(createWeapon(def));
  return w;
}

function ring(w: World, type: string, n: number, r: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    out.push(w.spawnEnemy(ENEMY_INDEX[type], w.player.x + Math.sin(a) * r, w.player.z + Math.cos(a) * r));
  }
  return out;
}

function pulses(w: World, kind: number): number {
  let n = 0;
  w.pulseFx.drain(0, (d, o) => {
    if (d[o + 4] === kind) n++;
  });
  return n;
}

describe('evrim imzaları', () => {
  it('her evrimin bir imzası, adı ve açıklaması var; temel silahlarda imza yok', () => {
    expect(new Set(EVOLUTIONS.map((e) => e.def.signature?.kind)).size).toBe(EVOLUTIONS.length);
    for (const e of EVOLUTIONS) {
      expect(e.def.signature, e.def.id).toBeDefined();
      expect(e.def.signatureName?.length).toBeGreaterThan(2);
      expect(e.def.signatureText?.length).toBeGreaterThan(10);
    }
    for (const d of WEAPONS) expect(d.signature).toBeUndefined();
  });

  it('Işık Bölünmesi: öldüren büyü oku yavru ışıklara bölünür', () => {
    const w = withWeapon('magicBolt');
    for (const i of ring(w, 'slime', 6, 7)) w.enemies.hp[i] = 1;
    let children = 0;
    for (let s = 0; s < 90 && children === 0; s++) {
      w.step(NO_INPUT, DT);
      const pr = w.projectiles;
      for (let i = 0; i < pr.count; i++) if (pr.flags[i] & PF_CHILD) children++;
    }
    expect(w.kills).toBeGreaterThan(0);
    expect(children).toBeGreaterThanOrEqual(2);
  });

  it('Ruh Emme: hale vurduğu düşmanlardan can emer (temel hale emmez)', () => {
    const gain = (evolved: boolean) => {
      const w = withWeapon('fireAura', evolved);
      w.player.hp = 40;
      for (const i of ring(w, 'golem', 10, 2)) w.enemies.hp[i] = w.enemies.maxHp[i] = 1e6;
      for (let s = 0; s < 60; s++) w.step(NO_INPUT, DT);
      return { hp: w.player.hp - 40, pulses: pulses(w, PULSE_DRAIN) };
    };
    const base = gain(false);
    const evo = gain(true);
    expect(evo.hp).toBeGreaterThan(base.hp + 2);
    expect(evo.pulses).toBeGreaterThan(0);
    expect(base.pulses).toBe(0);
  });

  it('İnfaz: Kan Kılıcı %15 altını anında biçer; temel kılıç ve boss biçilmez', () => {
    const hitTo = (evolved: boolean, boss = false) => {
      const w = withWeapon('sword', evolved);
      const i = w.spawnEnemy(ENEMY_INDEX.zombie, w.player.x + 30, w.player.z);
      if (boss) w.enemies.flags[i] |= EF_BOSS;
      w.enemies.maxHp[i] = 1000;
      w.enemies.hp[i] = 160;
      w.dmgSrc = 0;
      w.damageEnemy(i, 20 / w.stats.get('damage'), 0, 0);
      w.dmgSrc = -1;
      let executed = 0;
      w.hitFx.drain(0, (d, o) => {
        if (d[o + 4] === HIT_EXECUTE) executed++;
      });
      return { dead: w.enemies.dead[i] === 1, executed };
    };
    expect(hitTo(true)).toEqual({ dead: true, executed: 1 });
    expect(hitTo(false).dead).toBe(false);
    expect(hitTo(true, true).dead).toBe(false);
  });

  it('Nefes Alan Yörünge: yarıçap 1× ile 2× arasında salınır', () => {
    const w = withWeapon('orbit');
    const inst = w.weapons[0];
    const base = inst.stats.area * w.stats.get('area');
    let lo = Number.POSITIVE_INFINITY;
    let hi = 0;
    for (let t = 0; t < 6; t += 0.1) {
      w.time = t;
      const r = orbitRadius(w, inst);
      lo = Math.min(lo, r);
      hi = Math.max(hi, r);
    }
    expect(lo).toBeCloseTo(base, 1);
    expect(hi).toBeCloseTo(base * 2, 1);
  });

  it('Girdap: balta en uzak noktada ~0,6 sn yerinde durur', () => {
    const w = withWeapon('boomerang');
    const target = w.spawnEnemy(ENEMY_INDEX.golem, w.player.x, w.player.z + 12);
    w.enemies.hp[target] = w.enemies.maxHp[target] = 1e6;
    let still = 0;
    let lastX = Number.NaN;
    let lastZ = Number.NaN;
    for (let s = 0; s < 240; s++) {
      w.step(NO_INPUT, DT);
      const pr = w.projectiles;
      if (pr.count === 0 || !(pr.flags[0] & PF_WHIRLED) || pr.aux[0] <= 0) continue;
      if (pr.x[0] === lastX && pr.z[0] === lastZ) still++;
      lastX = pr.x[0];
      lastZ = pr.z[0];
    }
    expect(still * DT).toBeGreaterThan(0.45);
  });

  it('Gök Gürültüsü: yüksek şansla sekmelerde gökten yıldırım düşer', () => {
    const w = withWeapon('chain');
    w.stats.addFlat('luck', 2);
    for (const i of ring(w, 'golem', 8, 5)) w.enemies.hp[i] = w.enemies.maxHp[i] = 1e6;
    for (let s = 0; s < 120; s++) w.step(NO_INPUT, DT);
    let sky = 0;
    w.beamFx.drain(0, (d, o) => {
      if (d[o + 1] - d[o + 4] > 10) sky++;
    });
    expect(sky).toBeGreaterThan(2);
  });

  it('Kara Delik: meteor çevresini merkeze çeker, boss etkilenmez', () => {
    const w = withWeapon('mortar', true);
    const cx = w.player.x + 10;
    const cz = w.player.z;
    const a = w.spawnEnemy(ENEMY_INDEX.zombie, cx + 5, cz);
    const b = w.spawnEnemy(ENEMY_INDEX.zombie, cx - 5, cz);
    w.enemies.flags[b] |= EF_BOSS;
    w.enemies.knockResist[b] = 1;
    w.weapons[0].timer = 1e9;
    w.step(NO_INPUT, DT);
    w.weapons[0].timer = 0;
    w.pullEnemies(cx, cz, 7, 3);
    expect(w.enemies.kx[a]).toBeLessThan(0);
    expect(w.enemies.kx[b]).toBe(0);
    // Silah ateşlenince çekim halkası yazılır.
    for (const i of ring(w, 'golem', 6, 9)) w.enemies.hp[i] = w.enemies.maxHp[i] = 1e6;
    for (let s = 0; s < 150; s++) w.step(NO_INPUT, DT);
    expect(pulses(w, PULSE_VOID)).toBeGreaterThan(0);
  });

  it('Yanık: Ejderha Nefesi isabeti 2,5 sn yakar, hasar silah yuvasına yazılır', () => {
    const w = withWeapon('shotgun');
    w.weapons[0].timer = 1e9;
    const i = w.spawnEnemy(ENEMY_INDEX.golem, w.player.x + 30, w.player.z);
    w.enemies.hp[i] = w.enemies.maxHp[i] = 1e6;
    w.dmgSrc = 0;
    w.damageEnemy(i, 10, 0, 0);
    w.dmgSrc = -1;
    const hp = w.enemies.hp[i];
    const dmg = w.run.weaponDamage[0];
    expect(w.enemies.burn[i]).toBeCloseTo(2.5);
    for (let s = 0; s < 60; s++) w.step(NO_INPUT, DT);
    expect(w.enemies.hp[i]).toBeLessThan(hp - 10 * 0.4 * 0.5);
    expect(w.run.weaponDamage[0]).toBeGreaterThan(dmg);
    for (let s = 0; s < 120; s++) w.step(NO_INPUT, DT);
    expect(w.enemies.burn[i]).toBeLessThanOrEqual(0);
  });
});
