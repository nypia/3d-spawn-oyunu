import { ITEM_FX, ITEM_INDEX } from '../../data/items';
import type { WeaponDef, WeaponLevelDelta, WeaponStats } from '../../data/weapons';
import { PF_GROUND_FOLLOW, PF_RETURNS, PROJ_AXE, PROJ_BOLT, PROJ_PELLET } from '../combat/ProjectilePool';
import type { World } from '../world/World';

export interface AppliedDelta {
  delta: WeaponLevelDelta;
  /** Kartın nadirlik çarpanı. */
  mult: number;
}

export interface WeaponInstance {
  def: WeaponDef;
  level: number;
  /** Alınan yükseltmeler (sırasıyla, nadirlik çarpanlarıyla). */
  applied: AppliedDelta[];
  /** Yükseltmelerle hesaplanmış ham değerler (oyuncu stat'ları uygulanmadan). */
  stats: WeaponStats;
  timer: number;
  /** Davranışa özel faz (yörünge açısı vb.). */
  phase: number;
  /** Yankı Yüzüğü: >0 ise bu kadar sn sonra silah bir kez daha ateşlenir. */
  echo: number;
}

export function createWeapon(def: WeaponDef): WeaponInstance {
  return { def, level: 1, applied: [], stats: computeWeaponStats(def, []), timer: 0.3, phase: 0, echo: 0 };
}

export function computeWeaponStats(def: WeaponDef, applied: readonly AppliedDelta[]): WeaponStats {
  const s: WeaponStats = { ...def.base };
  let cooldownCut = 0;
  let areaPct = 0;
  let durationPct = 0;
  for (const { delta: d, mult } of applied) {
    if (d.damage) s.damage += d.damage * mult;
    if (d.cooldownPct) cooldownCut += d.cooldownPct * mult;
    if (d.areaPct) areaPct += d.areaPct * mult;
    if (d.durationPct) durationPct += d.durationPct * mult;
    if (d.count) s.count += d.count;
    if (d.pierce) s.pierce += d.pierce;
  }
  // Bekleme en fazla %75 kısalır (sonsuz ateş hızını engelle).
  s.cooldown *= Math.max(0.25, 1 - cooldownCut);
  s.area *= 1 + areaPct;
  s.duration *= 1 + durationPct;
  return s;
}

/** Silahı bir seviye yükseltir; delta, silahın sıradaki seviye deltasıdır. */
export function levelUpWeapon(w: WeaponInstance, mult: number): void {
  const delta = w.def.levels[w.level - 1];
  if (!delta) return;
  w.level++;
  w.applied.push({ delta, mult });
  w.stats = computeWeaponStats(w.def, w.applied);
}

const nearest = new Int32Array(16);
const chainHit = new Int32Array(32);

/** Silahın atış başına sayısı (Çoğaltma Kitabı dahil). */
export function weaponCount(world: World, w: WeaponInstance): number {
  return Math.max(1, Math.round(w.stats.count + world.stats.get('projectileCount')));
}

/** Yörünge taşlarının yarıçapı (render da aynı formülü kullanır). */
export function orbitRadius(world: World, w: WeaponInstance): number {
  return w.stats.area * world.stats.get('area');
}

export function updateWeapon(world: World, w: WeaponInstance, dt: number): void {
  if (w.def.behavior === 'orbit') w.phase += w.stats.speed * dt;
  if (w.echo > 0) {
    w.echo -= dt;
    if (w.echo <= 0) fire(world, w);
  }
  w.timer -= dt;
  if (w.timer > 0) return;
  const fired = fire(world, w);
  // Hedef yoksa beklemeye girme: düşman gelince hemen ateşle.
  w.timer = fired ? w.stats.cooldown / Math.max(0.1, world.stats.get('attackSpeed')) : 0;
  const rings = world.itemCounts[ITEM_INDEX.echo];
  if (fired && rings > 0 && world.rng.chance(Math.min(ITEM_FX.echoMaxChance, ITEM_FX.echoChance * rings))) {
    w.echo = ITEM_FX.echoDelay;
  }
}

function fire(world: World, w: WeaponInstance): boolean {
  const st = world.stats;
  const p = world.player;
  const e = world.enemies;
  const s = w.stats;
  const chestY = p.y + 1.1;

  switch (w.def.behavior) {
    case 'homingBolt': {
      const count = weaponCount(world, w);
      const found = world.findNearestEnemies(p.x, p.z, 24, Math.min(count, nearest.length), nearest);
      if (found === 0) return false;
      const speed = s.speed * st.get('projectileSpeed');
      for (let k = 0; k < count; k++) {
        const t = nearest[k % found];
        let dx = e.x[t] - p.x;
        const dy = e.y[t] + e.hover[t] + 0.5 - chestY;
        let dz = e.z[t] - p.z;
        // Aynı hedefe giden fazladan mermileri biraz yay.
        if (k >= found) {
          const spread = (k - found + 1) * 0.35 * (k % 2 === 0 ? 1 : -1);
          [dx, dz] = rotate(dx, dz, spread);
        }
        const len = Math.max(1e-4, Math.hypot(dx, dy, dz));
        world.spawnProjectile({
          kind: PROJ_BOLT,
          x: p.x,
          y: chestY,
          z: p.z,
          vx: (dx / len) * speed,
          vy: (dy / len) * speed,
          vz: (dz / len) * speed,
          life: s.duration * st.get('duration'),
          damage: s.damage,
          radius: s.area * Math.sqrt(st.get('area')),
          pierce: s.pierce,
          knockback: s.knockback,
          homing: 5,
        });
      }
      return true;
    }

    case 'aura': {
      world.auraRadius = s.area * st.get('area');
      world.damageInRadius(p.x, p.y, p.z, world.auraRadius, s.damage, s.knockback);
      return true;
    }

    case 'arc': {
      const range = s.area * st.get('area');
      if (world.findNearestEnemies(p.x, p.z, range + 1.5, 1, nearest) === 0) return false;
      const t = nearest[0];
      const base = Math.atan2(e.x[t] - p.x, e.z[t] - p.z);
      const count = weaponCount(world, w);
      for (let k = 0; k < count; k++) {
        const a = base + (k * Math.PI * 2) / count;
        world.damageInSector(p.x, p.y, p.z, Math.sin(a), Math.cos(a), range, 0.5, s.damage, s.knockback);
        world.arcFx.push(p.x, chestY, p.z, a, range);
      }
      return true;
    }

    case 'orbit': {
      const count = weaponCount(world, w);
      const r = orbitRadius(world, w);
      const hitR = 0.7 * Math.sqrt(st.get('area'));
      for (let k = 0; k < count; k++) {
        const a = w.phase + (k * Math.PI * 2) / count;
        const ox = p.x + Math.sin(a) * r;
        const oz = p.z + Math.cos(a) * r;
        world.damageInRadius(ox, chestY, oz, hitR, s.damage, s.knockback);
      }
      return true;
    }

    case 'boomerang': {
      if (world.findNearestEnemies(p.x, p.z, 20, 1, nearest) === 0) return false;
      const t = nearest[0];
      const count = weaponCount(world, w);
      const speed = s.speed * st.get('projectileSpeed');
      const base = Math.atan2(e.x[t] - p.x, e.z[t] - p.z);
      for (let k = 0; k < count; k++) {
        const a = base + (k - (count - 1) / 2) * 0.45;
        world.spawnProjectile({
          kind: PROJ_AXE,
          x: p.x,
          y: chestY,
          z: p.z,
          vx: Math.sin(a) * speed,
          vy: 0,
          vz: Math.cos(a) * speed,
          life: s.duration * st.get('duration'),
          damage: s.damage,
          radius: s.area * Math.sqrt(st.get('area')),
          pierce: s.pierce,
          knockback: s.knockback,
          flags: PF_GROUND_FOLLOW | PF_RETURNS,
        });
      }
      return true;
    }

    case 'chain': {
      if (world.findNearestEnemies(p.x, p.z, 14, 1, nearest) === 0) return false;
      const hops = Math.min(chainHit.length, weaponCount(world, w));
      const jump = s.area * st.get('area');
      let cur = nearest[0];
      let fx = p.x;
      let fy = chestY;
      let fz = p.z;
      let hits = 0;
      while (cur >= 0 && hits < hops) {
        const ty = e.y[cur] + e.hover[cur] + 0.6;
        world.beamFx.push(fx, fy, fz, e.x[cur], ty, e.z[cur]);
        chainHit[hits++] = e.uid[cur];
        const kx = e.x[cur] - fx;
        const kz = e.z[cur] - fz;
        const kl = Math.hypot(kx, kz) || 1;
        world.damageEnemy(cur, s.damage, (kx / kl) * s.knockback, (kz / kl) * s.knockback);
        fx = e.x[cur];
        fy = ty;
        fz = e.z[cur];
        // Sıradaki: daha önce vurulmamış en yakın düşman.
        const n = world.findNearestEnemies(fx, fz, jump, nearest.length, nearest);
        cur = -1;
        for (let q = 0; q < n; q++) {
          const c = nearest[q];
          if (e.dead[c]) continue;
          let seen = false;
          for (let h = 0; h < hits; h++) if (chainHit[h] === e.uid[c]) seen = true;
          if (!seen) {
            cur = c;
            break;
          }
        }
      }
      return true;
    }

    case 'mortar': {
      const found = world.findNearestEnemies(p.x, p.z, 16, 8, nearest);
      if (found === 0) return false;
      const r = s.area * st.get('area');
      const count = Math.min(found, weaponCount(world, w));
      // En kalabalık adayları seç (komşu sayısına göre).
      const scored: { i: number; n: number }[] = [];
      for (let q = 0; q < found; q++) {
        const c = nearest[q];
        scored.push({ i: c, n: world.countEnemiesNear(e.x[c], e.z[c], r) });
      }
      scored.sort((a, b) => b.n - a.n);
      for (let k = 0; k < count; k++) {
        const c = scored[k].i;
        world.addBlast(e.x[c], e.z[c], r, s.damage, s.knockback, s.duration);
      }
      return true;
    }

    case 'cone': {
      if (world.findNearestEnemies(p.x, p.z, 12, 1, nearest) === 0) return false;
      const t = nearest[0];
      const count = weaponCount(world, w);
      const speed = s.speed * st.get('projectileSpeed');
      const base = Math.atan2(e.x[t] - p.x, e.z[t] - p.z);
      const spread = 0.7; // toplam yelpaze (rad)
      for (let k = 0; k < count; k++) {
        const f = count === 1 ? 0 : k / (count - 1) - 0.5;
        const a = base + f * spread + world.rng.range(-0.04, 0.04);
        world.spawnProjectile({
          kind: PROJ_PELLET,
          x: p.x,
          y: chestY,
          z: p.z,
          vx: Math.sin(a) * speed,
          vy: world.rng.range(-0.6, 0.6),
          vz: Math.cos(a) * speed,
          life: s.duration * st.get('duration'),
          damage: s.damage,
          radius: s.area * Math.sqrt(st.get('area')),
          pierce: s.pierce,
          knockback: s.knockback,
          flags: PF_GROUND_FOLLOW,
        });
      }
      return true;
    }
  }
}

function rotate(x: number, z: number, a: number): [number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - z * s, x * s + z * c];
}
