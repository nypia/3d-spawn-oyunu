import { BALANCE } from '../data/balance';
import { BOSSES } from '../data/bosses';
import { ENEMIES, ENEMY_INDEX } from '../data/enemies';
import { ITEMS } from '../data/items';
import { PACTS } from '../data/pacts';
import { TOMES } from '../data/tomes';
import { WAVE_EVENTS } from '../data/waves';
import { EF_SPECIAL } from '../sim/enemies/EnemyPool';
import {
  ANN_BLOOD_MOON,
  ANN_BOSS_DEAD,
  ANN_BOSS_SPAWN,
  ANN_BOSS_WARN,
  ANN_CAULDRON,
  ANN_EVENT,
  ANN_GOBLIN,
  ANN_GOBLIN_ESCAPE,
  ANN_PACT,
} from '../sim/world/announce';
import { CAULDRON } from '../sim/world/Interactables';
import type { World } from '../sim/world/World';
import { formatTime, h } from './dom';

/**
 * Oyun içi gösterge: XP barı, seviye, süre, kill, altın, can barı,
 * silah/kitap/eşya ikonları ve yakındaki sandığın fiyat ipucu.
 */
export class Hud {
  readonly el: HTMLDivElement;
  private readonly xpFill = h('div.xp-fill');
  private readonly level = h('span.xp-level');
  private readonly timer = h('div.hud-timer');
  /** "☀️ Gün · 👑 Balçık Kral 1:20" ya da "🌕 Kan Ayı 2 · …" */
  private readonly phase = h('div.hud-phase', { 'data-testid': 'phase' });
  private readonly kills = h('span.hud-kill-count');
  private readonly gold = h('span.hud-gold-count', { 'data-testid': 'gold' });
  private readonly hpFill = h('div.hp-fill');
  private readonly hpText = h('span.hp-text');
  private readonly loadout = h('div.hud-loadout');
  private readonly hint = h('div.hud-hint');
  /** Tespih alınınca tüm ekranı kaplayan beyaz flaş. */
  private readonly flash = h('div.screen-flash');
  /** Hasar alınca ve can azken kırmızı kenar. */
  private readonly hurt = h('div.hurt-vignette');
  private lastHurt = -1;
  private lastFlash = -1;
  /** Kısa süreli duyuru (Anka Tüyü dirilişi vb.). */
  private readonly toast = h('div.hud-toast', { 'data-testid': 'toast' });
  /** Büyük duyuru şeridi (dalga olayları, boss, Kan Ayı); sırayla gösterilir. */
  private readonly banner = h('div.hud-banner', { 'data-testid': 'banner' });
  private readonly bannerTitle = h('div.banner-title');
  private readonly bannerSub = h('div.banner-sub');
  private readonly bannerQueue: Announcement[] = [];
  private bannerUntil = 0;
  private annWorld: World | null = null;
  /** Ekran dışındaki Hazine Goblinini gösteren ok. */
  private readonly goblinArrow = h(
    'div.goblin-arrow',
    { 'data-testid': 'goblin-arrow' },
    h('span.goblin-arrow-tip', {}, '▲'),
    h('span.goblin-arrow-text'),
  );
  private goblinShown = false;
  /** Ekranın üstünde boss can barları. */
  private readonly bossBars = h('div.boss-bars', { 'data-testid': 'boss-bars' });
  private lastBossKey = '';
  private annCursor = 0;
  private lastLoadoutKey = '';
  /** 🔊 düğmesi (sessiz aç/kapat). */
  private readonly soundBtn = h('button.hud-sound', { 'data-testid': 'sound', 'aria-label': 'Ses' }, '🔊');
  onSound: (() => void) | null = null;
  private lastText = { level: '', timer: '', kills: '', gold: '', hp: '', hint: '', toast: '', phase: '' };

  constructor(parent: HTMLElement) {
    this.el = h(
      'div.hud',
      {},
      h('div.vignette'),
      this.hurt,
      this.flash,
      h('div.xp-bar', {}, this.xpFill, this.level),
      this.timer,
      this.phase,
      h(
        'div.hud-kills',
        {},
        this.soundBtn,
        h('span', {}, '💀 '),
        this.kills,
        h('span.hud-gold', {}, '🪙 ', this.gold),
      ),
      this.loadout,
      this.hint,
      this.toast,
      this.banner,
      this.goblinArrow,
      this.bossBars,
      h('div.hp-bar', {}, this.hpFill, this.hpText),
    );
    parent.append(this.el);
    this.hint.style.display = 'none';
    this.toast.style.display = 'none';
    this.banner.append(this.bannerTitle, this.bannerSub);
    this.banner.style.display = 'none';
    this.goblinArrow.style.display = 'none';
    this.soundBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onSound?.();
    });
    this.setVisible(false);
  }

  setMuted(muted: boolean): void {
    this.soundBtn.textContent = muted ? '🔇' : '🔊';
    this.soundBtn.classList.toggle('muted', muted);
  }

  setVisible(v: boolean): void {
    this.el.style.display = v ? '' : 'none';
  }

  /** `cameraYaw`: kameranın yönü (goblin okunun ekrandaki açısı için). */
  update(world: World, cameraYaw = Math.PI): void {
    const p = world.player;
    this.xpFill.style.transform = `scaleX(${Math.min(1, world.xp / world.xpNext)})`;
    this.hpFill.style.transform = `scaleX(${Math.max(0, p.hp / p.maxHp)})`;
    this.setText('level', this.level, `Sv. ${world.level}`);
    this.setText('timer', this.timer, formatTime(world.time));
    this.setText('phase', this.phase, phaseText(world));
    this.phase.classList.toggle('blood', world.cycle > 1);
    this.setText('kills', this.kills, String(world.kills));
    this.setText('gold', this.gold, String(Math.floor(world.gold)));
    this.setText('hp', this.hpText, `${Math.ceil(p.hp)} / ${Math.round(p.maxHp)}`);

    // Hasar anında parlayan, can %30'un altındayken nabız gibi atan kırmızı kenar.
    const low = p.hp > 0 && p.hp / p.maxHp < 0.3 ? 0.35 + Math.sin(performance.now() / 180) * 0.15 : 0;
    const hurt = Math.round(Math.max(low, (p.hurtTimer / 0.25) * 0.9) * 50) / 50;
    if (hurt !== this.lastHurt) {
      this.lastHurt = hurt;
      this.hurt.style.opacity = String(hurt);
    }

    // Tespih: beyaz flaş (CSS animasyonu yeniden başlatılır).
    if (world.holyAt >= 0 && world.holyAt !== this.lastFlash) {
      this.lastFlash = world.holyAt;
      this.flash.classList.remove('on');
      void this.flash.offsetWidth;
      this.flash.classList.add('on');
    }

    const toast =
      world.revivedAt >= 0 && world.time - world.revivedAt < 2.5 ? '🦅 Anka Tüyü: küllerinden doğdun!' : '';
    if (toast !== this.lastText.toast) this.toast.style.display = toast ? '' : 'none';
    this.setText('toast', this.toast, toast);

    this.updateBanner(world);

    this.updateGoblinArrow(world, cameraYaw);
    this.updateBossBars(world);

    const chest = world.nearbyChest();
    const spot = chest ? null : world.nearbyLandmark();
    let hint = '';
    if (spot && spot.kind === CAULDRON) {
      hint =
        spot.cooldown > 0
          ? `🔥 Ruh Kazanı soğuyor · ${Math.ceil(spot.cooldown)} sn`
          : `🔥 Ruh Kazanı %${Math.floor(spot.fill * 100)} · yakınında düşman öldür`;
    } else if (spot) {
      hint = spot.used ? '🕯️ Lanet Sunağı · pakt yapıldı' : '🕯️ Lanet Sunağı · üstüne bas, pakt yap';
    } else if (chest) {
      hint = chest.free
        ? '📦 Ödül sandığı · ücretsiz, üstüne yürü'
        : `📦 Sandık · ${chest.price} altın${chest.affordable ? ', üstüne yürü' : ' (altın yetmiyor)'}`;
      if (world.findEvolution() >= 0) hint += ' · ★ evrim hazır';
    }
    if (hint !== this.lastText.hint) {
      this.hint.classList.toggle('poor', !!chest && !chest.affordable);
      this.hint.style.display = hint ? '' : 'none';
    }
    this.setText('hint', this.hint, hint);

    const key =
      world.weapons.map((w) => `${w.def.id}${w.level}`).join() +
      world.tomeLevels.join() +
      world.itemCounts.join();
    if (key !== this.lastLoadoutKey) {
      this.lastLoadoutKey = key;
      const weapons = world.weapons.map((w) => {
        if (w.def.evolvesFrom) return slot(w.def.icon, '★', w.def.name, 'evolved');
        if (world.canEvolve(w))
          return slot(w.def.icon, w.level, `${w.def.name}: evrime hazır, sandık aç!`, 'ready');
        return slot(w.def.icon, w.level, w.def.name);
      });
      const tomes = TOMES.flatMap((t, i) =>
        world.tomeLevels[i] > 0 ? [slot(t.icon, world.tomeLevels[i], t.name)] : [],
      );
      this.loadout.replaceChildren(
        h(
          'div.loadout-row',
          { 'data-testid': 'weapon-slots' },
          ...padSlots(weapons, BALANCE.levelUp.weaponSlots, 'Boş silah yuvası'),
        ),
        h(
          'div.loadout-row',
          { 'data-testid': 'tome-slots' },
          ...padSlots(tomes, BALANCE.levelUp.tomeSlots, 'Boş kitap yuvası'),
        ),
        h(
          'div.loadout-row.items',
          {},
          ...ITEMS.flatMap((d, i) =>
            world.itemCounts[i] > 0 ? [slot(d.icon, world.itemCounts[i], `${d.name}: ${d.description}`)] : [],
          ),
        ),
      );
    }
  }

  private updateBanner(world: World): void {
    if (world !== this.annWorld) {
      // Yeni run: baştan oku (HUD açılmadan önce yazılan duyurular da gösterilsin).
      this.annWorld = world;
      this.annCursor = 0;
      this.bannerQueue.length = 0;
    }
    this.annCursor = world.announceFx.drain(this.annCursor, (d, o) => {
      const a = announcement(d[o], d[o + 1], d[o + 2], world.cycle);
      if (!a) return;
      // Kan Ayı sırayı beklemez: kızıl flaşla hemen gelir.
      if (d[o] === ANN_BLOOD_MOON) {
        this.bannerQueue.unshift(a);
        this.bannerUntil = 0;
        this.flash.classList.remove('on', 'blood');
        void this.flash.offsetWidth;
        this.flash.classList.add('on', 'blood');
      } else this.bannerQueue.push(a);
    });
    const now = performance.now();
    if (now < this.bannerUntil) return;
    const next = this.bannerQueue.shift();
    if (!next) {
      if (this.banner.style.display !== 'none') this.banner.style.display = 'none';
      return;
    }
    this.bannerTitle.textContent = next.title;
    this.bannerSub.textContent = next.sub;
    this.banner.className = `hud-banner ${next.style}`;
    this.banner.style.setProperty('--life', `${next.ms / 1000}s`);
    this.banner.style.display = '';
    // Animasyonu yeniden başlat.
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    this.bannerUntil = now + next.ms;
  }

  private updateBossBars(world: World): void {
    const bars = world.bosses.active.length ? world.bosses.bars(world) : [];
    const key = bars.map((b) => b.name).join('|');
    if (key !== this.lastBossKey) {
      this.lastBossKey = key;
      this.bossBars.replaceChildren(
        ...bars.map((b) => {
          const fill = h('div.boss-fill');
          fill.style.background = `#${b.color.toString(16).padStart(6, '0')}`;
          return h('div.boss-bar', {}, h('div.boss-name', {}, `👑 ${b.name}`), h('div.boss-track', {}, fill));
        }),
      );
    }
    bars.forEach((b, k) => {
      const fill = this.bossBars.children[k]?.querySelector('.boss-fill') as HTMLElement | null;
      if (fill) fill.style.transform = `scaleX(${b.frac})`;
    });
  }

  /** Hazine Goblini ekrandayken kenarda dönen ok + mesafe. */
  private updateGoblinArrow(world: World, yaw: number): void {
    const e = world.enemies;
    let g = -1;
    for (let i = 0; i < e.count; i++) if (!e.dead[i] && e.flags[i] & EF_SPECIAL) g = i;
    const show = g >= 0;
    if (show !== this.goblinShown) {
      this.goblinShown = show;
      this.goblinArrow.style.display = show ? '' : 'none';
    }
    if (!show) return;
    const p = world.player;
    const dx = e.x[g] - p.x;
    const dz = e.z[g] - p.z;
    // Kamera ileri (−sin, −cos) ve sağ (cos, −sin) eksenlerine izdüşüm: 0 = ekranın üstü.
    const f = -dx * Math.sin(yaw) - dz * Math.cos(yaw);
    const r = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    const a = Math.atan2(r, f);
    // Önündeyse (ekranda) ok soluklaşır.
    this.goblinArrow.style.opacity = Math.abs(a) < 0.45 && f < 40 ? '0.25' : '1';
    this.goblinArrow.style.transform = `translate(-50%, -50%) translate(${Math.sin(a) * 38}vmin, ${-Math.cos(a) * 30}vmin)`;
    (this.goblinArrow.firstChild as HTMLElement).style.transform = `rotate(${a}rad)`;
    (this.goblinArrow.lastChild as HTMLElement).textContent = `💰 ${Math.round(Math.hypot(dx, dz))} m`;
  }

  private setText(key: keyof Hud['lastText'], el: HTMLElement, text: string): void {
    if (this.lastText[key] === text) return;
    this.lastText[key] = text;
    el.textContent = text;
  }
}

interface Announcement {
  title: string;
  sub: string;
  /** CSS sınıfı: event | boss | blood | gold … */
  style: string;
  ms: number;
}

const EVENT_VERB = {
  ring: 'etrafını sarıyor!',
  swarm: 'küme halinde geliyor!',
  horde: 'duvar gibi yürüyor!',
};

/** Zamanlayıcının altındaki satır: gün / Kan Ayı ve sıradaki boss'a kalan süre. */
function phaseText(world: World): string {
  const phase = world.cycle > 1 ? `🌕 Kan Ayı ${world.cycle}` : '☀️ Gün';
  const b = world.bosses;
  const def = BOSSES[b.next];
  if (!def || b.active.length > 0) return phase;
  const left = b.dueAt(world) - world.time;
  if (left <= 0 || left > 600) return phase;
  const name = world.cycle > 1 ? `Kanlı ${def.name}` : def.name;
  return `${phase} · 👑 ${name} ${formatTime(left)}`;
}

function announcement(kind: number, value: number, extra: number, cycle: number): Announcement | null {
  if (kind === ANN_BLOOD_MOON)
    return {
      title: '🌕 KAN AYI DOĞDU',
      sub: `Döngü ${value} · düşmanlar güçlendi, boss'lar kanlı döndü`,
      style: 'blood',
      ms: 3800,
    };
  const boss = BOSSES[value];
  // Boss duyurusu olayın olduğu döngüyü taşır (final boss ölünce döngü çoktan ilerlemiştir).
  const bossCycle = extra || cycle;
  const bossName = boss ? (bossCycle > 1 ? `Kanlı ${boss.name}` : boss.name) : '';
  if (kind === ANN_BOSS_WARN && boss) {
    const sub = boss.final ? 'Final boss · 10 saniye' : '10 saniye içinde geliyor';
    return { title: `⚠ ${bossName} yaklaşıyor!`, sub, style: 'boss', ms: 3000 };
  }
  if (kind === ANN_BOSS_SPAWN && boss)
    return { title: `👑 ${bossName}`, sub: boss.title, style: 'boss', ms: 3000 };
  if (kind === ANN_BOSS_DEAD && boss)
    return { title: `🏆 ${bossName} yenildi!`, sub: 'Boss sandığını aç', style: 'gold', ms: 3000 };
  if (kind === ANN_EVENT) {
    const ev = WAVE_EVENTS[value];
    if (!ev) return null;
    const enemy = ENEMIES[ENEMY_INDEX[ev.enemy]];
    const sub = `${extra || ev.count} ${enemy.name} ${EVENT_VERB[ev.kind]}`;
    return { title: `⚠ ${ev.name}`, sub, style: 'event', ms: 2600 };
  }
  if (kind === ANN_GOBLIN)
    return {
      title: '💰 Hazine Goblini!',
      sub: 'Kaçmadan yakala — vurdukça altın saçar',
      style: 'gold',
      ms: 2600,
    };
  if (kind === ANN_GOBLIN_ESCAPE)
    return { title: '💨 Goblin kaçtı', sub: 'Bir dahakine…', style: 'gold', ms: 1800 };
  if (kind === ANN_CAULDRON)
    return { title: '🔥 Ruh Kazanı patladı!', sub: 'Kazan sandığı düştü', style: 'soul', ms: 2200 };
  if (kind === ANN_PACT) {
    const d = PACTS[value];
    if (!d) return null;
    return { title: `${d.icon} ${d.name}`, sub: `${d.boonText} · ${d.baneText}`, style: 'pact', ms: 2600 };
  }
  return null;
}

function slot(icon: string, level: number | string, title: string, state = ''): HTMLElement {
  return h(
    `div.slot${state ? `.${state}` : ''}`,
    { title },
    h('span.slot-icon', {}, icon),
    h('span.slot-level', {}, String(level)),
  );
}

/** Dolu yuvaların ardına kesik çizgili boş yuvalar ekler: 4 silah + 4 kitap sınırı hep görünür. */
function padSlots(filled: HTMLElement[], max: number, title: string): HTMLElement[] {
  const out = [...filled];
  while (out.length < max) out.push(h('div.slot.empty', { title }));
  return out;
}
