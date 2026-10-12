import type { WeaponDef, WeaponStats } from '../../data/weapons';
import type { World } from '../world/World';

export interface WeaponInstance {
  def: WeaponDef;
  level: number;
  /** Seviyeye göre hesaplanmış ham değerler (oyuncu stat'ları uygulanmadan). */
  stats: WeaponStats;
  timer: number;
}

export function createWeapon(def: WeaponDef): WeaponInstance {
  return { def, level: 1, stats: computeWeaponStats(def, 1), timer: 0.3 };
}

export function computeWeaponStats(def: WeaponDef, level: number): WeaponStats {
  const s: WeaponStats = { ...def.base };
  for (let l = 0; l < level - 1 && l < def.levels.length; l++) {
    const d = def.levels[l];
    if (d.damage) s.damage += d.damage;
    if (d.cooldownMul) s.cooldown *= d.cooldownMul;
    if (d.count) s.count += d.count;
    if (d.area) s.area += d.area;
    if (d.pierce) s.pierce += d.pierce;
    if (d.speed) s.speed += d.speed;
  }
  return s;
}

export function levelUpWeapon(w: WeaponInstance): void {
  w.level++;
  w.stats = computeWeaponStats(w.def, w.level);
}

const nearest = new Int32Array(16);

export function updateWeapon(world: World, w: WeaponInstance, dt: number): void {
  const st = world.stats;
  const cooldown = w.stats.cooldown / Math.max(0.1, st.get('attackSpeed'));
  w.timer -= dt;
  if (w.timer > 0) return;

  switch (w.def.behavior) {
    case 'homingBolt': {
      const count = Math.max(1, Math.round(w.stats.count + st.get('projectileCount')));
      const p = world.player;
      const found = world.findNearestEnemies(p.x, p.z, 24, Math.min(count, nearest.length), nearest);
      if (found === 0) {
        // Hedef yok: hazır bekle, düşman gelince hemen ateşle.
        w.timer = 0;
        return;
      }
      const e = world.enemies;
      const speed = w.stats.speed * st.get('projectileSpeed');
      const ox = p.x;
      const oy = p.y + 1.1;
      const oz = p.z;
      for (let k = 0; k < count; k++) {
        const t = nearest[k % found];
        let dx = e.x[t] - ox;
        const dy = e.y[t] + e.hover[t] + 0.5 - oy;
        let dz = e.z[t] - oz;
        // Aynı hedefe giden fazladan mermileri biraz yay.
        if (k >= found) {
          const spread = (k - found + 1) * 0.35 * (k % 2 === 0 ? 1 : -1);
          const c = Math.cos(spread);
          const s = Math.sin(spread);
          const rx = dx * c - dz * s;
          dz = dx * s + dz * c;
          dx = rx;
        }
        const len = Math.max(1e-4, Math.hypot(dx, dy, dz));
        world.spawnProjectile(
          0,
          ox,
          oy,
          oz,
          (dx / len) * speed,
          (dy / len) * speed,
          (dz / len) * speed,
          w.stats.duration * st.get('duration'),
          w.stats.damage,
          w.stats.area * Math.sqrt(st.get('area')),
          w.stats.pierce,
          w.stats.knockback,
          5,
        );
      }
      w.timer = cooldown;
      return;
    }
    case 'aura': {
      world.auraRadius = w.stats.area * st.get('area');
      world.damageInRadius(
        world.player.x,
        world.player.y,
        world.player.z,
        world.auraRadius,
        w.stats.damage,
        w.stats.knockback,
      );
      w.timer = cooldown;
      return;
    }
  }
}
