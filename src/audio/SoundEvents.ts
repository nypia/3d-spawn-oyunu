import { ATTACK_KINDS, type BossAttack } from '../data/bosses';
import { ENEMIES, SHOT_ARROW } from '../data/enemies';
import { HZ_GLOB, HZ_LINE } from '../sim/combat/Hazards';
import { PROJ_AXE, PROJ_BOLT, PROJ_PELLET } from '../sim/combat/ProjectilePool';
import { PICKUP_BAG, PICKUP_GOLD, PICKUP_HEAL } from '../sim/pickups/PickupPool';
import {
  ANN_BLOOD_MOON,
  ANN_BOSS_DEAD,
  ANN_BOSS_SPAWN,
  ANN_BOSS_WARN,
  ANN_EVENT,
  ANN_GOBLIN,
  ANN_GOBLIN_ESCAPE,
} from '../sim/world/announce';
import { ALTAR, CAULDRON, CHEST, VASE } from '../sim/world/Interactables';
import { GOBLIN_DEATH, GOBLIN_DROP } from '../sim/world/Landmarks';
import { TORCH_FX } from '../sim/world/Torches';
import {
  COLLECT_GEM,
  PULSE_FREEZE,
  PULSE_HOLY,
  PULSE_MAGNET,
  PULSE_PHOENIX,
  SHOT_ENEMY,
  type World,
} from '../sim/world/World';
import type { AudioManager } from './AudioManager';
import type { SoundId } from './sounds';

/** Ölüm sesi türe göre: yumuşak (balçık, hayalet), kemik (iskelet, okçu, bekçi), ağır (golem…). */
const DEATH: Record<string, SoundId> = {
  slime: 'deathSoft',
  bat: 'deathSoft',
  ghost: 'deathSoft',
  exploder: 'deathSoft',
  skeleton: 'deathBone',
  archer: 'deathBone',
  keeper: 'deathBone',
  zombie: 'deathHeavy',
  golem: 'deathHeavy',
  vampire: 'deathHeavy',
  goblin: 'deathHeavy',
};

/** Boss saldırıya hazırlanırken çalan uyarı sesi (tür → ses, hız). */
const TELEGRAPH: Record<BossAttack['kind'], [SoundId, number]> = {
  hopSlam: ['jump', 0.6],
  rain: ['slime', 0.8],
  dashChain: ['force', 1.2],
  summon: ['bell', 0.9],
  slam: ['bell', 0.7],
  throw: ['swing', 0.6],
  spikeLines: ['spikes', 0.7],
  spikeRing: ['spikes', 0.6],
  charge: ['force', 0.9],
  nova: ['orb', 0.8],
};

const STEP = 1.9;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Sim olay akışlarını (EventRing) kendi imleçleriyle okuyup seslere çevirir — Effects ve HUD gibi
 * ayrı bir okuyucu. Oyuncu durumundan (zıplama, iniş, kayma, adım, hasar, seviye) de ses üretir.
 */
export class SoundEvents {
  private world: World | null = null;
  private hit = 0;
  private death = 0;
  private blast = 0;
  private brk = 0;
  private pulse = 0;
  private collect = 0;
  private arc = 0;
  private beam = 0;
  private shot = 0;
  private ann = 0;
  private hazard = 0;
  private telegraph = 0;
  private goblin = 0;
  private jump = 0;
  private land = 0;
  private slide = 0;
  private level = 1;
  private hp = 0;
  private stepDist = 0;
  private stepAlt = false;
  private gemChain = 0;
  private lastGem = 0;
  private wasOver = false;

  /** Yeni dünyada imleçler sona alınır (eski olaylar çalmasın). */
  private attach(w: World): void {
    this.world = w;
    this.hit = w.hitFx.written;
    this.death = w.deathFx.written;
    this.blast = w.blastFx.written;
    this.brk = w.breakFx.written;
    this.pulse = w.pulseFx.written;
    this.collect = w.collectFx.written;
    this.arc = w.arcFx.written;
    this.beam = w.beamFx.written;
    this.shot = w.shotFx.written;
    this.ann = w.announceFx.written;
    this.hazard = w.hazardFx.written;
    this.telegraph = w.telegraphFx.written;
    this.goblin = w.goblinFx.written;
    const p = w.player;
    this.jump = p.jumpSeq;
    this.land = p.landSeq;
    this.slide = p.slideSeq;
    this.level = w.level;
    this.hp = p.hp;
    this.wasOver = w.gameOver;
  }

  /** `live`: sim ilerliyor mu; duraklatma/seviye/sandık ekranlarında adım sesi çalmaz. */
  update(w: World, a: AudioManager, dt: number, time: number, live = true): void {
    if (w !== this.world) this.attach(w);
    const p = w.player;

    this.hit = w.hitFx.drain(this.hit, (d, o) => {
      if (d[o + 4]) a.play('crit', { x: d[o], z: d[o + 2], rate: rand(0.95, 1.1) });
      else a.play(Math.random() < 0.5 ? 'hit1' : 'hit2', { x: d[o], z: d[o + 2], rate: rand(0.85, 1.2) });
    });
    this.death = w.deathFx.drain(this.death, (d, o) => {
      const def = ENEMIES[d[o + 3]];
      if (!def) return;
      if (def.role === 'boss') {
        a.play('boom', { rate: 0.8 });
        return;
      }
      const id = DEATH[def.model ?? def.id] ?? 'deathSoft';
      a.play(id, { x: d[o], z: d[o + 2], rate: rand(0.9, 1.1) / Math.sqrt(Math.max(1, d[o + 5])) });
    });
    this.blast = w.blastFx.drain(this.blast, (d, o) => {
      a.play(d[o + 3] > 4 ? 'boom' : 'explosion', { x: d[o], z: d[o + 2], rate: rand(0.9, 1.1) });
    });
    this.brk = w.breakFx.drain(this.brk, (d, o) => {
      const kind = d[o + 3];
      const pos = { x: d[o], z: d[o + 2] };
      if (kind === VASE) a.play('vase', { ...pos, rate: rand(0.9, 1.15) });
      else if (kind === CHEST) a.play('latch', pos);
      else if (kind === CAULDRON) {
        a.play('slime', pos);
        a.play('boom', { ...pos, rate: 1.2 });
      } else if (kind === ALTAR) {
        a.play('force', pos);
        a.play('bell', { ...pos, rate: 0.6 });
      } else if (kind === TORCH_FX) a.play('wood', pos);
    });
    this.pulse = w.pulseFx.drain(this.pulse, (d, o) => {
      const kind = d[o + 4];
      if (kind === PULSE_MAGNET) a.play('magnet');
      else if (kind === PULSE_FREEZE) a.play('freeze');
      else if (kind === PULSE_HOLY) a.play('bell', { rate: 1.2 });
      else if (kind === PULSE_PHOENIX) {
        a.play('boom', { rate: 1.3 });
        a.play('revealRare');
      }
    });
    this.collect = w.collectFx.drain(this.collect, (d, o) => {
      const kind = d[o + 3];
      if (kind === COLLECT_GEM) {
        // Art arda toplanan taşlar giderek incelen bir zil.
        this.gemChain = time - this.lastGem < 0.4 ? Math.min(14, this.gemChain + 1) : 0;
        this.lastGem = time;
        a.play('gem', { rate: 1 + this.gemChain * 0.055 });
      } else if (kind - 1 === PICKUP_GOLD) a.play('coin', { rate: rand(0.9, 1.15) });
      else if (kind - 1 === PICKUP_BAG) a.play('coins');
      else if (kind - 1 === PICKUP_HEAL) a.play('heal');
    });
    this.arc = w.arcFx.drain(this.arc, () => a.play('swing', { rate: rand(0.9, 1.1) }));
    this.beam = w.beamFx.drain(this.beam, () => a.play('zap', { rate: rand(0.9, 1.2) }));
    this.shot = w.shotFx.drain(this.shot, (d, o) => {
      const kind = d[o + 3];
      if (kind === PROJ_BOLT) a.play('bolt', { rate: rand(0.9, 1.15) });
      else if (kind === PROJ_AXE) a.play('axe', { rate: rand(0.9, 1.1) });
      else if (kind === PROJ_PELLET) a.play('pellet', { rate: rand(0.9, 1.1) });
      else if (kind >= SHOT_ENEMY) {
        a.play(kind - SHOT_ENEMY === SHOT_ARROW ? 'arrow' : 'orb', { x: d[o], z: d[o + 2] });
      }
    });
    this.ann = w.announceFx.drain(this.ann, (d, o) => {
      const kind = d[o];
      if (kind === ANN_EVENT) a.play('bong');
      else if (kind === ANN_BOSS_WARN) a.play('bell', { rate: 0.8 });
      else if (kind === ANN_BOSS_SPAWN) a.play('boom', { rate: 0.7 });
      else if (kind === ANN_BOSS_DEAD) a.play('bossDead');
      else if (kind === ANN_BLOOD_MOON) {
        // Kan Ayı gongu: derin çan + alçak gümbürtü.
        a.play('bell', { rate: 0.5, vol: 1.4 });
        a.play('boom', { rate: 0.6 });
      } else if (kind === ANN_GOBLIN) a.play('coins');
      else if (kind === ANN_GOBLIN_ESCAPE) a.play('back');
    });
    this.hazard = w.hazardFx.drain(this.hazard, (d, o) => {
      const pos = { x: d[o], z: d[o + 1] };
      if (d[o + 4] === HZ_LINE) a.play('spikes', { ...pos, rate: rand(0.9, 1.1) });
      else if (d[o + 4] === HZ_GLOB) a.play('slime', { ...pos, rate: rand(0.9, 1.2) });
      else a.play(d[o + 5] > 3 ? 'boom' : 'explosion', { ...pos, rate: rand(0.85, 1) });
    });
    this.telegraph = w.telegraphFx.drain(this.telegraph, (d, o) => {
      const t = TELEGRAPH[ATTACK_KINDS[d[o + 2]]];
      if (t) a.play(t[0], { x: d[o], z: d[o + 1], rate: t[1], vol: 1.2 });
    });
    this.goblin = w.goblinFx.drain(this.goblin, (d, o) => {
      const code = d[o + 3];
      if (code === GOBLIN_DROP) a.play('coin', { x: d[o], z: d[o + 2], rate: rand(1, 1.3) });
      else if (code === GOBLIN_DEATH) {
        a.play('goblinCaught');
        a.play('coins');
      }
    });

    // Oyuncu
    if (p.jumpSeq !== this.jump) {
      this.jump = p.jumpSeq;
      a.play('jump', { rate: rand(0.95, 1.1) });
    }
    if (p.landSeq !== this.land) {
      this.land = p.landSeq;
      a.play('land');
    }
    if (p.slideSeq !== this.slide) {
      this.slide = p.slideSeq;
      a.play('slide');
    }
    if (live && p.grounded && !p.sliding && p.speed > 1.5) {
      this.stepDist += p.speed * dt;
      if (this.stepDist > STEP) {
        this.stepDist = 0;
        this.stepAlt = !this.stepAlt;
        a.play(this.stepAlt ? 'step1' : 'step2', { rate: rand(0.9, 1.1) });
      }
    }
    if (p.hp < this.hp - 0.5) a.play('hurt', { rate: rand(0.9, 1.1) });
    this.hp = p.hp;
    if (w.level > this.level) a.play('levelUp');
    this.level = w.level;
    if (w.gameOver && !this.wasOver) a.play('gameOver');
    this.wasOver = w.gameOver;
  }
}
