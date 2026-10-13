import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { SHRINE, SHRINE_BONUSES } from '../../src/data/shrines';
import { NO_INPUT } from '../../src/sim/player/Player';
import { SHRINE as SHRINE_KIND } from '../../src/sim/world/Interactables';
import { World } from '../../src/sim/world/World';

const DT = BALANCE.simStep;

function setup(): { w: World; s: number } {
  const w = new World({ seed: 41, enemyCap: 0 });
  w.weapons.length = 0;
  let s = -1;
  for (let i = 0; i < w.interactables.count; i++) if (w.interactables.kind[i] === SHRINE_KIND) s = i;
  expect(s).toBeGreaterThanOrEqual(0);
  return { w, s };
}

function standAt(w: World, x: number, z: number): void {
  w.player.x = x;
  w.player.z = z;
  w.player.y = w.terrain.heightAt(x, z);
}

describe('tapınak', () => {
  it('içinde durunca dolar ve 3 bonus sunar; seçilen bonus uygulanır', () => {
    const { w, s } = setup();
    const it = w.interactables;
    standAt(w, it.x[s] + 1, it.z[s]);
    for (let t = 0; t < SHRINE.chargeTime - 0.5; t += DT) w.step(NO_INPUT, DT);
    expect(w.reward).toBeNull();
    expect(it.charge[s]).toBeGreaterThan(0.8);
    for (let t = 0; t < 0.6 && !w.reward; t += DT) w.step(NO_INPUT, DT);
    expect(w.reward?.kind).toBe('shrine');
    expect(it.used[s]).toBe(1);
    if (w.reward?.kind !== 'shrine') return;
    expect(w.reward.options).toHaveLength(SHRINE.choices);
    const o = w.reward.options[1];
    const def = SHRINE_BONUSES[o.bonus];
    const before = w.stats.get(def.stat);
    w.takeReward(1);
    expect(w.stats.get(def.stat)).toBeGreaterThan(before);
    expect(w.paused).toBe(false);
  });

  it('dışarı çıkınca dolum geri iner', () => {
    const { w, s } = setup();
    const it = w.interactables;
    standAt(w, it.x[s], it.z[s]);
    for (let t = 0; t < 2; t += DT) w.step(NO_INPUT, DT);
    const charged = it.charge[s];
    standAt(w, it.x[s] + 20, it.z[s]);
    for (let t = 0; t < 2; t += DT) w.step(NO_INPUT, DT);
    expect(it.charge[s]).toBeLessThan(charged);
    expect(it.charge[s]).toBeGreaterThan(0);
  });
});
