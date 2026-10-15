import { BALANCE } from '../../src/data/balance';
import { TOMES } from '../../src/data/tomes';
import { HZF_VISUAL } from '../../src/sim/combat/Hazards';
import type { PlayerInput } from '../../src/sim/player/Player';
import type { UpgradeOption } from '../../src/sim/progression/Upgrades';
import type { World } from '../../src/sim/world/World';

/** Kitap tercihleri: can ve saldırı önce, toplama/şans en son. */
const TOME_SCORE: Record<string, number> = {
  maxHp: 2.6,
  projectileCount: 2.5,
  damage: 2.3,
  attackSpeed: 2.3,
  area: 2,
  moveSpeed: 1.8,
};

/** Seviye kartı puanı: dört silaha kadar silah, sonra silah seviyesi ve kitaplar; can azsa iyileşme. */
function score(world: World, o: UpgradeOption): number {
  const r = 'rarity' in o ? o.rarity * 0.3 : 0;
  switch (o.kind) {
    case 'weaponNew':
      return world.weapons.length < 4 ? 3 : 0;
    case 'weaponLevel':
      return 2.4 + r;
    case 'tome':
      return (TOME_SCORE[TOMES[o.tome].stat] ?? 1.2) + r;
    case 'heal':
      return world.player.hp < world.player.maxHp * 0.5 ? 3.2 : 0.3;
  }
}

/**
 * Denge ölçümü için "makul oyuncu" botu: en yakın XP taşına gider, yakındaki düşmanlardan ve kırmızı
 * uyarı alanlarından uzaklaşır, ara ara zıplar; seviye atlamada dengeli bir yapı kurar (silah + can +
 * saldırı kitapları), ödülleri alır.
 */
export function playBot(world: World, seconds: number, onMinute?: (w: World, hurt: number) => void): number {
  const dt = BALANCE.simStep;
  const input: PlayerInput = { moveX: 0, moveZ: 0, jump: false, slide: false };
  let hurt = 0;
  for (let s = 0; s < seconds * 60 && !world.gameOver; s++) {
    const t = s * dt;
    const p = world.player;
    const g = world.gems;
    let best = -1;
    let bd = 625;
    for (let i = 0; i < g.count; i++) {
      const d = (g.x[i] - p.x) ** 2 + (g.z[i] - p.z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    let mx = Math.cos(t * 0.35);
    let mz = Math.sin(t * 0.35);
    if (best >= 0) {
      const l = Math.sqrt(bd) || 1;
      mx = (g.x[best] - p.x) / l;
      mz = (g.z[best] - p.z) / l;
    }
    const e = world.enemies;
    for (let i = 0; i < e.count; i++) {
      const dx = p.x - e.x[i];
      const dz = p.z - e.z[i];
      const d2 = dx * dx + dz * dz;
      if (d2 > 36 || d2 < 1e-4) continue;
      const d = Math.sqrt(d2);
      const w = (6 - d) / 6;
      mx += (dx / d) * w * 1.5;
      mz += (dz / d) * w * 1.5;
    }
    // Patlamak üzere olan uyarı alanlarından kaç.
    const h = world.hazards;
    for (let i = 0; i < h.count; i++) {
      if (h.flags[i] & HZF_VISUAL || h.delay[i] > 1.2 || !h.contains(i, p.x, p.z, 1)) continue;
      const dx = p.x - h.x[i];
      const dz = p.z - h.z[i];
      const d = Math.hypot(dx, dz) || 1;
      mx += (dx / d) * 4;
      mz += (dz / d) * 4;
    }
    const ml = Math.hypot(mx, mz) || 1;
    input.moveX = mx / ml;
    input.moveZ = mz / ml;
    input.jump = s % 150 === 0;
    while (world.offer || world.reward) {
      if (world.reward) world.takeReward(0);
      else {
        const offer = world.offer as UpgradeOption[];
        let pick = 0;
        for (let k = 1; k < offer.length; k++)
          if (score(world, offer[k]) > score(world, offer[pick])) pick = k;
        world.choose(pick);
      }
    }
    const hp = p.hp;
    world.step(input, dt);
    if (p.hp < hp) hurt += hp - p.hp;
    if (onMinute && s % 3600 === 0 && s > 0) onMinute(world, hurt);
  }
  return world.time;
}
