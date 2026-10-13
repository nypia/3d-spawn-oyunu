import { BALANCE } from '../../data/balance';
import type { Stats } from '../stats/Stats';
import type { Heightmap } from '../terrain/Heightmap';

/** Simülasyona giden oyuncu girdisi. Hareket yönü DÜNYA uzayındadır (kamera dönüşü uygulanmış). */
export interface PlayerInput {
  moveX: number;
  moveZ: number;
  /** Bu adımda zıplama tuşuna basıldı mı (kenar tetik). */
  jump: boolean;
  /** Kayma tuşu basılı mı. */
  slide: boolean;
}

export const NO_INPUT: PlayerInput = { moveX: 0, moveZ: 0, jump: false, slide: false };

const P = BALANCE.player;
const normal = new Float32Array(3);

export class Player {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  /** Bakış yönü (rad); model +Z'ye bakar, rotation.y = facing. */
  facing = 0;
  grounded = true;
  sliding = false;
  hp: number = P.baseHp;
  maxHp: number = P.baseHp;
  /** Hasar alınca kısa süreli kırmızı yanıp sönme için. */
  hurtTimer = 0;
  /** Son zıplamanın zamanı (animasyon için). */
  airTime = 0;

  private coyote = 0;
  private jumpBuffer = 0;
  private jumpsLeft = 0;
  private slideCooldown = 0;

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  takeDamage(amount: number, armor: number): number {
    const dealt = amount * (100 / (100 + Math.max(0, armor)));
    this.hp -= dealt;
    this.hurtTimer = 0.25;
    return dealt;
  }

  update(input: PlayerInput, stats: Stats, terrain: Heightmap, dt: number): void {
    const moveSpeed = stats.get('moveSpeed');
    const jumpCount = Math.max(1, Math.round(stats.get('jumpCount')));

    // Girdi yönü (uzunluk ≤ 1).
    let ix = input.moveX;
    let iz = input.moveZ;
    const il = Math.hypot(ix, iz);
    if (il > 1) {
      ix /= il;
      iz /= il;
    }
    const hasInput = il > 0.05;

    // Zamanlayıcılar
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.slideCooldown = Math.max(0, this.slideCooldown - dt);
    this.jumpBuffer = input.jump ? P.jumpBuffer : Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.grounded ? P.coyoteTime : Math.max(0, this.coyote - dt);
    this.airTime = this.grounded ? 0 : this.airTime + dt;

    terrain.normalAt(this.x, this.z, normal);
    const [nx, ny, nz] = normal;
    let speed = this.speed;

    // --- Kayma başlat / bitir ---
    if (input.slide && this.grounded && !this.sliding && this.slideCooldown <= 0 && (hasInput || speed > 1)) {
      this.sliding = true;
      let dx = speed > 0.5 ? this.vx / speed : ix;
      let dz = speed > 0.5 ? this.vz / speed : iz;
      if (hasInput && speed <= 0.5) {
        dx = ix;
        dz = iz;
      }
      const boosted = Math.max(speed, moveSpeed * P.slideBoost * stats.get('slidePower'));
      this.vx = dx * boosted;
      this.vz = dz * boosted;
      speed = boosted;
    }
    if (this.sliding && !input.slide) this.endSlide();

    // --- Yatay hareket ---
    if (this.grounded && this.sliding) {
      // Eğim boyunca yerçekimi: yokuş aşağı hızlan.
      this.vx += P.gravity * ny * nx * dt;
      this.vz += P.gravity * ny * nz * dt;
      speed = this.speed;
      // Sürtünme
      if (speed > 0) {
        const s2 = Math.max(0, speed - P.slideFriction * dt);
        this.vx *= s2 / speed;
        this.vz *= s2 / speed;
        speed = s2;
      }
      // Sınırlı yönlendirme: hız vektörünü girdi yönüne doğru döndür.
      if (hasInput && speed > 0.1) this.steer(ix, iz, P.slideSteer * dt);
      if (speed < moveSpeed * P.slideMinSpeedFactor) this.endSlide();
    } else if (this.grounded) {
      const tx = hasInput ? ix * moveSpeed : 0;
      const tz = hasInput ? iz * moveSpeed : 0;
      this.accelerateTowards(tx, tz, P.groundAccel * dt);
    } else if (hasInput) {
      // Havada momentumu koru ama yönlendirmeye izin ver (bunny-hop).
      const target = Math.max(moveSpeed, speed);
      this.accelerateTowards(ix * target, iz * target, P.airAccel * dt);
    }

    // --- Zıplama (coyote time + buffer + çoklu zıplama) ---
    if (this.jumpBuffer > 0) {
      const fromGround = this.grounded || this.coyote > 0;
      if (fromGround || this.jumpsLeft > 0) {
        this.vy = Math.sqrt(2 * P.gravity * P.jumpHeight);
        this.jumpsLeft = fromGround ? jumpCount - 1 : this.jumpsLeft - 1;
        this.grounded = false;
        this.coyote = 0;
        this.jumpBuffer = 0;
        if (this.sliding) this.endSlide();
      }
    }

    // Hız sınırı
    speed = this.speed;
    if (speed > P.maxSpeed) {
      this.vx *= P.maxSpeed / speed;
      this.vz *= P.maxSpeed / speed;
    }

    // Çok dik yokuşa tırmanmayı engelle (yokuş yukarı bileşeni sil).
    const ahead = 0.6;
    const len = Math.max(1e-6, this.speed);
    terrain.normalAt(this.x + (this.vx / len) * ahead, this.z + (this.vz / len) * ahead, normal);
    if (normal[1] < P.maxWalkSlopeNormalY) {
      const hx = normal[0];
      const hz = normal[2];
      const hl2 = hx * hx + hz * hz;
      const dot = this.vx * hx + this.vz * hz;
      if (dot < 0 && hl2 > 1e-6) {
        this.vx -= (dot / hl2) * hx;
        this.vz -= (dot / hl2) * hz;
      }
    }

    // --- Entegrasyon ---
    if (!this.grounded) this.vy -= P.gravity * dt;
    this.x = terrain.clampToPlayable(this.x + this.vx * dt);
    this.z = terrain.clampToPlayable(this.z + this.vz * dt);
    this.y += this.vy * dt;

    const ground = terrain.heightAt(this.x, this.z);
    const wasGrounded = this.grounded;
    if (this.y <= ground) {
      this.y = ground;
      if (this.vy < 0) this.vy = 0;
      if (!wasGrounded) this.jumpsLeft = jumpCount - 1;
      this.grounded = true;
    } else if (wasGrounded && this.vy <= 0 && this.y - ground < P.stepDown) {
      // Küçük inişlerde zemine yapış (her tümsekte havalanmasın).
      this.y = ground;
      this.vy = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    if (this.speed > 0.4) this.facing = Math.atan2(this.vx, this.vz);
    else if (hasInput) this.facing = Math.atan2(ix, iz);
  }

  private endSlide(): void {
    this.sliding = false;
    this.slideCooldown = P.slideCooldown;
  }

  private accelerateTowards(tx: number, tz: number, maxDelta: number): void {
    const dx = tx - this.vx;
    const dz = tz - this.vz;
    const d = Math.hypot(dx, dz);
    if (d <= maxDelta) {
      this.vx = tx;
      this.vz = tz;
    } else {
      this.vx += (dx / d) * maxDelta;
      this.vz += (dz / d) * maxDelta;
    }
  }

  /** Hız vektörünü büyüklüğünü koruyarak (ix,iz) yönüne en fazla maxAngle kadar döndürür. */
  private steer(ix: number, iz: number, maxAngle: number): void {
    const speed = this.speed;
    const cur = Math.atan2(this.vx, this.vz);
    const want = Math.atan2(ix, iz);
    let diff = want - cur;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const a = cur + Math.max(-maxAngle, Math.min(maxAngle, diff));
    this.vx = Math.sin(a) * speed;
    this.vz = Math.cos(a) * speed;
  }
}
