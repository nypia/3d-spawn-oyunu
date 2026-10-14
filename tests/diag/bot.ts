import { BALANCE } from '../../src/data/balance';
import type { PlayerInput } from '../../src/sim/player/Player';
import type { World } from '../../src/sim/world/World';

/**
 * Denge ölçümü için "makul oyuncu" botu: en yakın XP taşına gider, yakındaki düşmanlardan uzaklaşır,
 * ara ara zıplar; seviye atlamada silah kartlarını tercih eder, ödülleri alır.
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
    const ml = Math.hypot(mx, mz) || 1;
    input.moveX = mx / ml;
    input.moveZ = mz / ml;
    input.jump = s % 150 === 0;
    while (world.offer || world.reward) {
      if (world.reward) world.takeReward(0);
      else {
        const i = world.offer!.findIndex((o) => o.kind === 'weaponLevel' || o.kind === 'weaponNew');
        world.choose(i >= 0 ? i : 0);
      }
    }
    const hp = p.hp;
    world.step(input, dt);
    if (p.hp < hp) hurt += hp - p.hp;
    if (onMinute && s % 3600 === 0 && s > 0) onMinute(world, hurt);
  }
  return world.time;
}
