/** Uyarı alanı türleri: daire, çizgi (x,z → x2,z2), havada uçan kaya (x2,z2'den x,z'ye düşer). */
export const HZ_CIRCLE = 0;
export const HZ_LINE = 1;
export const HZ_BOULDER = 2;

/** Yalnızca görsel (ör. atılma yolu): hasar vermez. */
export const HZF_VISUAL = 1;

/**
 * Gecikmeli tehlike alanları (boss saldırıları): önce yerde kırmızı uyarı olarak görünür, süre dolunca
 * içindeki oyuncuya hasar verir. Yeterince yükseğe zıplayan oyuncu kurtulur. SoA havuz, swap-remove.
 */
export class Hazards {
  readonly capacity: number;
  count = 0;
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly x2: Float32Array;
  readonly z2: Float32Array;
  /** Daire yarıçapı ya da çizginin yarı genişliği. */
  readonly radius: Float32Array;
  /** Kalan süre ve toplam süre (render dolumu için). */
  readonly delay: Float32Array;
  readonly total: Float32Array;
  readonly damage: Float32Array;
  readonly kind: Uint8Array;
  readonly flags: Uint8Array;

  constructor(capacity: number) {
    this.capacity = capacity;
    const f = () => new Float32Array(capacity);
    this.x = f();
    this.z = f();
    this.x2 = f();
    this.z2 = f();
    this.radius = f();
    this.delay = f();
    this.total = f();
    this.damage = f();
    this.kind = new Uint8Array(capacity);
    this.flags = new Uint8Array(capacity);
  }

  add(
    kind: number,
    x: number,
    z: number,
    radius: number,
    delay: number,
    damage: number,
    x2 = x,
    z2 = z,
    flags = 0,
  ): number {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    this.kind[i] = kind;
    this.x[i] = x;
    this.z[i] = z;
    this.x2[i] = x2;
    this.z2[i] = z2;
    this.radius[i] = radius;
    this.delay[i] = this.total[i] = Math.max(0.05, delay);
    this.damage[i] = damage;
    this.flags[i] = flags;
    return i;
  }

  /** (px,pz) noktası alanın içinde mi (`pad` = oyuncu yarıçapı)? */
  contains(i: number, px: number, pz: number, pad: number): boolean {
    const r = this.radius[i] + pad;
    if (this.kind[i] !== HZ_LINE) return (px - this.x[i]) ** 2 + (pz - this.z[i]) ** 2 <= r * r;
    // Çizgi: en yakın segment noktasına uzaklık.
    const ax = this.x[i];
    const az = this.z[i];
    const dx = this.x2[i] - ax;
    const dz = this.z2[i] - az;
    const len2 = dx * dx + dz * dz || 1e-6;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
    return (px - ax - dx * t) ** 2 + (pz - az - dz * t) ** 2 <= r * r;
  }

  removeAt(i: number): void {
    const last = --this.count;
    if (i === last) return;
    this.x[i] = this.x[last];
    this.z[i] = this.z[last];
    this.x2[i] = this.x2[last];
    this.z2[i] = this.z2[last];
    this.radius[i] = this.radius[last];
    this.delay[i] = this.delay[last];
    this.total[i] = this.total[last];
    this.damage[i] = this.damage[last];
    this.kind[i] = this.kind[last];
    this.flags[i] = this.flags[last];
  }

  clear(): void {
    this.count = 0;
  }
}
