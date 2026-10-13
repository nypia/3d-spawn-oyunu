/** Bir merminin aynı düşmana iki kez vurmaması için hatırladığı en fazla uid sayısı. */
export const HIT_SLOTS = 8;

/** Mermi türleri (render hangi mesh'i kullanacak + özel davranış). */
export const PROJ_BOLT = 0;
export const PROJ_AXE = 1;
export const PROJ_PELLET = 2;

/** flags bitleri */
export const PF_GROUND_FOLLOW = 1;
export const PF_RETURNS = 2;
export const PF_RETURNING = 4;

export class ProjectilePool {
  readonly capacity: number;
  count = 0;

  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly life: Float32Array;
  readonly maxLife: Float32Array;
  readonly damage: Float32Array;
  readonly radius: Float32Array;
  readonly knockback: Float32Array;
  /** Saniyede dönebileceği açı (rad); 0 = takip etmez. */
  readonly homing: Float32Array;
  readonly pierceLeft: Uint8Array;
  /** Görsel tür (render hangi mesh'i kullanacak). */
  readonly kind: Uint8Array;
  readonly flags: Uint8Array;
  readonly dead: Uint8Array;
  readonly hitCount: Uint8Array;
  readonly hitUids: Int32Array;

  constructor(capacity: number) {
    this.capacity = capacity;
    const f = () => new Float32Array(capacity);
    this.x = f();
    this.y = f();
    this.z = f();
    this.vx = f();
    this.vy = f();
    this.vz = f();
    this.life = f();
    this.maxLife = f();
    this.damage = f();
    this.radius = f();
    this.knockback = f();
    this.homing = f();
    this.pierceLeft = new Uint8Array(capacity);
    this.kind = new Uint8Array(capacity);
    this.flags = new Uint8Array(capacity);
    this.dead = new Uint8Array(capacity);
    this.hitCount = new Uint8Array(capacity);
    this.hitUids = new Int32Array(capacity * HIT_SLOTS);
  }

  add(): number {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    this.dead[i] = 0;
    this.hitCount[i] = 0;
    this.flags[i] = 0;
    return i;
  }

  hasHit(i: number, uid: number): boolean {
    const base = i * HIT_SLOTS;
    const n = this.hitCount[i];
    for (let k = 0; k < n; k++) if (this.hitUids[base + k] === uid) return true;
    return false;
  }

  rememberHit(i: number, uid: number): void {
    const n = this.hitCount[i];
    // Dolarsa en eskisinin üzerine yaz (halka tampon).
    this.hitUids[i * HIT_SLOTS + (n % HIT_SLOTS)] = uid;
    this.hitCount[i] = n < HIT_SLOTS ? n + 1 : HIT_SLOTS;
  }

  removeDead(): void {
    for (let i = this.count - 1; i >= 0; i--) {
      if (this.dead[i]) this.removeAt(i);
    }
  }

  private removeAt(i: number): void {
    const last = --this.count;
    if (i === last) return;
    this.x[i] = this.x[last];
    this.y[i] = this.y[last];
    this.z[i] = this.z[last];
    this.vx[i] = this.vx[last];
    this.vy[i] = this.vy[last];
    this.vz[i] = this.vz[last];
    this.life[i] = this.life[last];
    this.maxLife[i] = this.maxLife[last];
    this.damage[i] = this.damage[last];
    this.radius[i] = this.radius[last];
    this.knockback[i] = this.knockback[last];
    this.homing[i] = this.homing[last];
    this.pierceLeft[i] = this.pierceLeft[last];
    this.kind[i] = this.kind[last];
    this.flags[i] = this.flags[last];
    this.dead[i] = this.dead[last];
    this.hitCount[i] = this.hitCount[last];
    this.hitUids.copyWithin(i * HIT_SLOTS, last * HIT_SLOTS, (last + 1) * HIT_SLOTS);
  }
}
