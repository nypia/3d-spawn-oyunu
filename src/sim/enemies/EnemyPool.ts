/**
 * Düşmanlar Struct-of-Arrays olarak tutulur: oyun sırasında bellek ayırma yok, cache dostu.
 * Silme "swap-remove" ile yapılır; bu yüzden indeksler kararsızdır, kalıcı kimlik için `uid` kullanın.
 * Bir tick içinde ölenler `dead` ile işaretlenir ve tick sonunda topluca silinir.
 */
export class EnemyPool {
  readonly capacity: number;
  count = 0;
  private nextUid = 1;

  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  /** Son hareket hızı (yüz yönü ve animasyon için). */
  readonly vx: Float32Array;
  readonly vz: Float32Array;
  /** Geri itilme hızı (sönümlenir). */
  readonly kx: Float32Array;
  readonly kz: Float32Array;
  readonly hp: Float32Array;
  readonly maxHp: Float32Array;
  readonly damage: Float32Array;
  readonly speed: Float32Array;
  readonly radius: Float32Array;
  readonly hover: Float32Array;
  readonly knockResist: Float32Array;
  readonly contactCd: Float32Array;
  /** Vuruş flaşı kalan süresi. */
  readonly flash: Float32Array;
  /** Animasyon fazı (her düşman farklı ritimde sallansın). */
  readonly phase: Float32Array;
  readonly xp: Float32Array;
  /** Görsel boy çarpanı (elitler büyük). */
  readonly scale: Float32Array;
  /** Davranışa özel sayaç: okçuda atış bekleme süresi, patlayanda fitil (−1 = sönük). */
  readonly timer: Float32Array;
  /** Donma süresi (Buz Kristali, Saat): >0 iken hareket, saldırı ve temas hasarı yok. */
  readonly frozen: Float32Array;
  /** Kendi isteğiyle yürüdüğü toplam mesafe (m): render yürüme döngüsünü buna göre ilerletir. */
  readonly travel: Float32Array;
  readonly type: Uint8Array;
  readonly elite: Uint8Array;
  readonly dead: Uint8Array;
  readonly uid: Int32Array;

  constructor(capacity: number) {
    this.capacity = capacity;
    const f = () => new Float32Array(capacity);
    this.x = f();
    this.y = f();
    this.z = f();
    this.vx = f();
    this.vz = f();
    this.kx = f();
    this.kz = f();
    this.hp = f();
    this.maxHp = f();
    this.damage = f();
    this.speed = f();
    this.radius = f();
    this.hover = f();
    this.knockResist = f();
    this.contactCd = f();
    this.flash = f();
    this.phase = f();
    this.xp = f();
    this.scale = f();
    this.timer = f();
    this.frozen = f();
    this.travel = f();
    this.type = new Uint8Array(capacity);
    this.elite = new Uint8Array(capacity);
    this.dead = new Uint8Array(capacity);
    this.uid = new Int32Array(capacity);
  }

  /** Yeni düşman ekler; doluysa -1 döner. Alanları çağıran doldurur (x,y,z,hp...). */
  add(type: number): number {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    this.type[i] = type;
    this.dead[i] = 0;
    this.uid[i] = this.nextUid++;
    this.vx[i] = 0;
    this.vz[i] = 0;
    this.kx[i] = 0;
    this.kz[i] = 0;
    this.contactCd[i] = 0;
    this.flash[i] = 0;
    this.scale[i] = 1;
    this.timer[i] = 0;
    this.frozen[i] = 0;
    this.travel[i] = 0;
    this.elite[i] = 0;
    return i;
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
    this.vz[i] = this.vz[last];
    this.kx[i] = this.kx[last];
    this.kz[i] = this.kz[last];
    this.hp[i] = this.hp[last];
    this.maxHp[i] = this.maxHp[last];
    this.damage[i] = this.damage[last];
    this.speed[i] = this.speed[last];
    this.radius[i] = this.radius[last];
    this.hover[i] = this.hover[last];
    this.knockResist[i] = this.knockResist[last];
    this.contactCd[i] = this.contactCd[last];
    this.flash[i] = this.flash[last];
    this.phase[i] = this.phase[last];
    this.xp[i] = this.xp[last];
    this.scale[i] = this.scale[last];
    this.timer[i] = this.timer[last];
    this.frozen[i] = this.frozen[last];
    this.travel[i] = this.travel[last];
    this.type[i] = this.type[last];
    this.elite[i] = this.elite[last];
    this.dead[i] = this.dead[last];
    this.uid[i] = this.uid[last];
  }
}
