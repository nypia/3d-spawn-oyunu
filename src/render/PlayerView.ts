import {
  CapsuleGeometry,
  ConeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshLambertMaterial,
  SphereGeometry,
} from 'three';
import type { Player } from '../sim/player/Player';

/**
 * Yer tutucu oyuncu modeli (M3'te animasyonlu glTF karakter gelecek).
 * Koşarken zıplama, kayarken eğilme, havada uzama gibi prosedürel animasyonlar.
 */
export class PlayerView {
  readonly root = new Group();
  private readonly body = new Group();
  private readonly bodyMat = new MeshLambertMaterial({ color: 0x3b6fd8, flatShading: true });
  private runPhase = 0;
  private landSquash = 0;
  private wasGrounded = true;

  constructor() {
    const skin = new MeshLambertMaterial({ color: 0xf1c79b, flatShading: true });
    const dark = new MeshLambertMaterial({ color: 0x23233a, flatShading: true });
    const gold = new MeshLambertMaterial({ color: 0xf2c94c, flatShading: true });

    const torso = new Mesh(new CapsuleGeometry(0.38, 0.55, 3, 8), this.bodyMat);
    torso.position.y = 0.75;
    const head = new Mesh(new IcosahedronGeometry(0.3, 1), skin);
    head.position.y = 1.45;
    const eyeL = new Mesh(new SphereGeometry(0.05, 6, 4), dark);
    eyeL.position.set(-0.11, 1.5, 0.26);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.11;
    const hat = new Mesh(new ConeGeometry(0.34, 0.55, 7), gold);
    hat.position.y = 1.82;
    const nose = new Mesh(new ConeGeometry(0.08, 0.25, 5), skin);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.42, 0.33);

    for (const m of [torso, head, eyeL, eyeR, hat, nose]) {
      m.castShadow = true;
      this.body.add(m);
    }
    this.root.add(this.body);
    this.root.name = 'player';
  }

  update(p: Player, dt: number, time: number): void {
    this.root.position.set(p.x, p.y, p.z);
    this.root.rotation.y = p.facing;

    if (p.grounded && !this.wasGrounded) this.landSquash = 0.25;
    this.wasGrounded = p.grounded;
    this.landSquash = Math.max(0, this.landSquash - dt * 1.6);

    const speed = p.speed;
    this.runPhase += dt * (4 + speed * 1.4);
    let bob = 0;
    let sy = 1;
    let lean = 0;
    if (p.sliding) {
      lean = -0.9;
      sy = 0.85;
      bob = -0.15;
    } else if (!p.grounded) {
      sy = p.vy > 0 ? 1.12 : 1.04;
      lean = 0.15;
    } else if (speed > 0.5) {
      bob = Math.abs(Math.sin(this.runPhase)) * 0.12;
      lean = Math.min(0.25, speed * 0.025);
    } else {
      sy = 1 + Math.sin(time * 2.5) * 0.02;
    }
    sy -= this.landSquash;
    this.body.position.y = bob;
    this.body.scale.set(1 + (1 - sy) * 0.6, sy, 1 + (1 - sy) * 0.6);
    this.body.rotation.x = lean;

    // Hasar alınca kırmızı, dokunulmazken (Anka Tüyü) altın rengi yanıp sön.
    const hurt = p.hurtTimer > 0 && Math.floor(p.hurtTimer * 30) % 2 === 0;
    const holy = p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0;
    this.bodyMat.color.setHex(hurt ? 0xff4d4d : holy ? 0xffd34d : 0x3b6fd8);
  }
}
