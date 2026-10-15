import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { BOSS, BOSSES } from '../../src/data/bosses';
import { CHEST_BOSS } from '../../src/data/chests';
import { ENEMIES, ENEMY_INDEX } from '../../src/data/enemies';
import { HZ_CIRCLE, HZ_LINE } from '../../src/sim/combat/Hazards';
import { EF_BOSS, EF_SUMMON } from '../../src/sim/enemies/EnemyPool';
import { NO_INPUT } from '../../src/sim/player/Player';
import { ANN_BOSS_DEAD, ANN_BOSS_SPAWN, ANN_BOSS_WARN } from '../../src/sim/world/announce';
import { CHEST } from '../../src/sim/world/Interactables';
import { World } from '../../src/sim/world/World';

const DT = BALANCE.simStep;

function quiet(seed = 12): World {
  const w = new World({ seed, enemyCap: 0, godMode: true });
  w.weapons.length = 0;
  w.landmarks.goblinAt = 1e9;
  return w;
}

function announced(w: World, kind: number): number[] {
  const out: number[] = [];
  w.announceFx.drain(0, (d, o) => {
    if (d[o] === kind) out.push(d[o + 1]);
  });
  return out;
}

function bossIndex(w: World): number {
  for (let i = 0; i < w.enemies.count; i++) if (w.enemies.flags[i] & EF_BOSS) return i;
  return -1;
}

describe('boss tanımları', () => {
  it('dört boss, sıralı zamanlar, son boss final; her biri bir boss türü', () => {
    expect(BOSSES.map((b) => b.at)).toEqual([300, 600, 900, 1200]);
    expect(BOSSES.filter((b) => b.final)).toHaveLength(1);
    expect(BOSSES[BOSSES.length - 1].final).toBe(true);
    for (const b of BOSSES) {
      const def = ENEMIES[ENEMY_INDEX[b.enemy]];
      expect(def.role).toBe('boss');
      expect(def.behavior).toBe('boss');
      expect(ENEMY_INDEX[def.model ?? '']).toBeDefined();
    }
  });
});

describe('boss zamanlaması', () => {
  it("5:00 öncesi uyarı, 5:00'te Balçık Kral doğar; dondurulamaz ve itilemez", () => {
    const w = quiet();
    w.time = BOSSES[0].at - BOSS.warn - 0.5;
    for (let t = 0; t < 1; t += DT) w.step(NO_INPUT, DT);
    expect(announced(w, ANN_BOSS_WARN)).toEqual([0]);
    expect(bossIndex(w)).toBe(-1);
    for (let t = 0; t < BOSS.warn; t += DT) w.step(NO_INPUT, DT);
    const i = bossIndex(w);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(w.enemies.type[i]).toBe(ENEMY_INDEX.slimeKing);
    expect(announced(w, ANN_BOSS_SPAWN)).toEqual([0]);
    expect(w.bosses.active).toHaveLength(1);
    w.freezeEnemy(i, 5);
    expect(w.enemies.frozen[i]).toBe(0);
    const kx = w.enemies.kx[i];
    w.damageEnemy(i, 1, 50, 0);
    expect(w.enemies.kx[i]).toBe(kx);
  });

  it('zaman atlanırsa ara boss atlanır ama final boss atlanmaz', () => {
    const w = quiet();
    w.time = 1300;
    for (let t = 0; t < 0.5; t += DT) w.step(NO_INPUT, DT);
    const i = bossIndex(w);
    expect(w.enemies.type[i]).toBe(ENEMY_INDEX.boneKing);
  });
});

describe('tehlike alanları', () => {
  it('süresi dolunca içindeki oyuncuya vurur, yükseğe zıplayan kurtulur', () => {
    const w = quiet();
    w.godMode = false;
    const p = w.player;
    w.hazards.add(HZ_CIRCLE, p.x, p.z, 2, 0.5, 30);
    for (let t = 0; t < 0.4; t += DT) w.step(NO_INPUT, DT);
    expect(p.hp).toBe(p.maxHp);
    for (let t = 0; t < 0.2; t += DT) w.step(NO_INPUT, DT);
    expect(p.hp).toBeLessThan(p.maxHp - 25);
    expect(w.hazards.count).toBe(0);
    expect(w.hazardFx.written).toBe(1);

    const hp = p.hp;
    w.hazards.add(HZ_LINE, p.x - 5, p.z, 1, 0.3, 30, p.x + 5, p.z);
    for (let t = 0; t < 0.5; t += DT) {
      p.y = w.terrain.heightAt(p.x, p.z) + 2;
      p.vy = 0;
      w.step(NO_INPUT, DT);
    }
    // Can yenilenmesi dışında değişmez.
    expect(p.hp).toBeGreaterThanOrEqual(hp);
  });

  it('Balçık Kral zıplayıp oyuncunun yanına iner (iniş alanı uyarılı)', () => {
    const w = quiet();
    w.bosses.spawn(w, 0);
    const i = bossIndex(w);
    const e = w.enemies;
    // Hemen zıplasın.
    w.bosses.active[0].timers[0] = 0;
    e.x[i] = w.player.x + 10;
    e.z[i] = w.player.z;
    let maxHover = 0;
    let warned = false;
    for (let t = 0; t < 2; t += DT) {
      w.step(NO_INPUT, DT);
      maxHover = Math.max(maxHover, e.hover[bossIndex(w)]);
      if (w.hazards.count > 0) warned = true;
    }
    expect(warned).toBe(true);
    expect(maxHover).toBeGreaterThan(2);
    const j = bossIndex(w);
    expect(Math.hypot(e.x[j] - w.player.x, e.z[j] - w.player.z)).toBeLessThan(4);
  });
});

describe('boss ölümü', () => {
  it('Balçık Kral ölünce bölünür, boss sandığı ve altın bırakır, duyurulur', () => {
    const w = quiet();
    w.bosses.spawn(w, 0);
    const i = bossIndex(w);
    const chests = w.interactables.count;
    w.damageEnemy(i, 1e12, 0, 0);
    w.enemies.removeDead();
    expect(w.bosses.active).toHaveLength(0);
    expect(w.bosses.killed).toBe(1);
    expect(announced(w, ANN_BOSS_DEAD)).toEqual([0]);
    let summons = 0;
    for (let k = 0; k < w.enemies.count; k++) if (w.enemies.flags[k] & EF_SUMMON) summons++;
    expect(summons).toBe(BOSSES[0].split?.count);
    const it = w.interactables;
    let chest = -1;
    for (let k = 0; k < it.count; k++)
      if (it.kind[k] === CHEST && it.tier[k] === CHEST_BOSS && !it.used[k]) chest = k;
    expect(chest).toBeGreaterThanOrEqual(chests - 1);
    expect(w.pickups.count).toBeGreaterThanOrEqual(BOSS.deathGold);
  });

  it('final boss sandığı en az epik eşya verir', () => {
    const w = quiet();
    w.bosses.spawn(w, 3);
    const i = bossIndex(w);
    w.damageEnemy(i, 1e12, 0, 0);
    w.enemies.removeDead();
    const it = w.interactables;
    let chest = -1;
    for (let k = 0; k < it.count; k++)
      if (it.kind[k] === CHEST && it.tier[k] === CHEST_BOSS && !it.used[k]) chest = k;
    w.player.x = it.x[chest];
    w.player.z = it.z[chest];
    w.player.y = w.terrain.heightAt(it.x[chest], it.z[chest]);
    w.step(NO_INPUT, DT);
    const r = w.reward;
    expect(r?.kind).toBe('item');
    if (r?.kind !== 'item') return;
    expect(r.items).toHaveLength(3);
    for (const d of r.items) expect(d.rarity).toBeGreaterThanOrEqual(BOSS.finalChestMinRarity);
  });
});
