import { h } from './dom';
import { RARITY_COLORS, reducedMotion, revealBurst } from './rewardFx';

/** Çarkta dönen bir kare. */
export interface ReelTile {
  icon: string;
  rarity: number;
}

/** Sandık sonucu kartı (kazanılan eşya). */
export interface ChestItemView extends ReelTile {
  name: string;
  description: string;
  rarityName: string;
  owned: number;
}

export interface ChestView {
  title: string;
  /** Sandık türü (CHEST_*): görünüm için. */
  tier: number;
  items: ChestItemView[];
  /** Şeridi dolduran eşyalar (tüm eşya listesi). */
  pool: readonly ReelTile[];
}

/** Ses kancaları (H7'de ses yöneticisi bağlanır). */
export interface RewardSounds {
  open?(): void;
  tick?(): void;
  reveal?(rarity: number): void;
}

/** Kare genişliği (px, CSS .reel-tile genişliği + yatay boşluk). */
const TILE = 72;
/** Kazanan karenin şeritteki yeri. */
const WIN = 26;
const RARITY_WEIGHTS = [60, 25, 11, 4];

function pickTile(pool: readonly ReelTile[], rarity: number): ReelTile {
  const same = pool.filter((t) => t.rarity === rarity);
  const list = same.length ? same : pool;
  return list[Math.floor(Math.random() * list.length)];
}

function randomRarity(): number {
  let r = Math.random() * 100;
  for (let i = 0; i < RARITY_WEIGHTS.length; i++) {
    r -= RARITY_WEIGHTS[i];
    if (r < 0) return i;
  }
  return 0;
}

function tileEl(t: ReelTile): HTMLElement {
  return h('div.reel-tile', { 'data-rarity': String(t.rarity) }, h('span', {}, t.icon));
}

interface Reel {
  win: HTMLElement;
  strip: HTMLElement;
  winTile: HTMLElement;
  duration: number;
  start: number;
  end: number;
  last: number;
  stopped: boolean;
}

/**
 * Sandık açılışı: sandık sarsılır (sızan ışık en iyi eşyanın renginde), kapak açılır, eşya şeritleri
 * yavaşlayarak döner ve kazanan karede durur; sonra nadirliğe göre açılış efekti ve sonuç kartları.
 * Tıklama / E / Boşluk animasyonu atlatır. Oyun bu sırada duraklatılmıştır; animasyon gerçek zamanla
 * (requestAnimationFrame) ilerler.
 */
export class ChestReel {
  readonly el: HTMLElement;
  /** Sonuçlar gösterildi mi (AL butonu etkin). */
  revealed = false;
  private readonly stage: HTMLElement;
  private readonly reelsEl: HTMLElement;
  private readonly results: HTMLElement;
  private readonly take: HTMLButtonElement;
  private readonly reels: Reel[] = [];
  private readonly best: number;
  private readonly calm = reducedMotion();
  private raf = 0;
  private t0 = 0;
  private spinAt: number;
  private opened = false;

  constructor(
    private readonly view: ChestView,
    private readonly layer: HTMLElement,
    private readonly sounds: RewardSounds,
    onTake: () => void,
  ) {
    this.best = Math.max(0, ...view.items.map((i) => i.rarity));
    this.spinAt = this.calm ? 0.2 : 0.75;
    const chest = h(
      'div.chest-art',
      {},
      h('div.chest-glow'),
      h('div.chest-lid'),
      h('div.chest-body', {}, h('div.chest-lock')),
    );
    this.stage = h('div.chest-stage', {}, chest);
    this.reelsEl = h('div.reels');
    this.results = h('div.chest-results');
    this.take = h('button.btn.btn-primary', { 'data-testid': 'take' }, 'AL', h('span.keys-only', {}, ' (E)'));
    this.take.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.revealed) onTake();
      else this.skip();
    });
    this.el = h(
      'div.panel.reward.chest',
      { 'data-testid': 'chest', 'data-tier': String(view.tier), 'data-best': String(this.best) },
      h('h2', {}, view.title),
      this.stage,
      this.reelsEl,
      this.results,
      h('div.buttons', {}, this.take),
      h('p.note.chest-skip', {}, 'Atlamak için tıkla'),
    );
    this.el.style.setProperty('--leak', RARITY_COLORS[this.best]);
    this.el.addEventListener('click', () => this.skip());
    view.items.forEach((item, k) => {
      const tiles: ReelTile[] = [];
      for (let i = 0; i < WIN + 4; i++) tiles.push(pickTile(view.pool, randomRarity()));
      tiles[WIN] = item;
      // Kıl payı: kazananın hemen yanında bazen efsanevi bir kare.
      if (item.rarity < 3 && Math.random() < 0.5) tiles[WIN + 1] = pickTile(view.pool, 3);
      const strip = h('div.reel-strip', {}, ...tiles.map(tileEl));
      const win = h('div.reel-window', {}, strip, h('div.reel-marker'));
      this.reelsEl.append(h('div.reel', {}, win));
      const base = (this.calm ? 0.8 : 2.4) + k * (this.calm ? 0.25 : 0.55);
      this.reels.push({
        win,
        strip,
        winTile: strip.children[WIN] as HTMLElement,
        duration: base,
        start: 0,
        end: 0,
        last: -1,
        stopped: false,
      });
    });
  }

  /** Panel DOM'a eklendikten sonra çağrılır. */
  start(): void {
    this.t0 = performance.now();
    this.stage.classList.add('shaking');
    const loop = () => {
      this.frame();
      if (!this.revealed) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
  }

  /** Animasyonu atlatır; zaten bittiyse false (E tuşu o zaman ödülü alır). */
  skip(): boolean {
    if (this.revealed) return false;
    if (!this.opened) this.open();
    for (const r of this.reels) this.stopReel(r);
    this.reveal();
    return true;
  }

  private open(): void {
    this.opened = true;
    this.stage.classList.remove('shaking');
    this.stage.classList.add('open');
    this.el.classList.add('spinning');
    this.sounds.open?.();
    for (const r of this.reels) {
      const w = r.win.clientWidth || 300;
      const center = w / 2 - TILE / 2;
      r.start = center - 2 * TILE;
      // Kazanan kareye kare içinde rastgele bir noktada dur, sonra ortalan.
      r.end = center - WIN * TILE + (Math.random() - 0.5) * TILE * 0.55;
      r.strip.style.transform = `translateX(${r.start}px)`;
    }
  }

  private frame(): void {
    const t = (performance.now() - this.t0) / 1000;
    if (!this.opened) {
      if (t >= this.spinAt) this.open();
      return;
    }
    const ts = t - this.spinAt;
    let all = true;
    for (const r of this.reels) {
      if (r.stopped) continue;
      const u = Math.min(1, ts / r.duration);
      const e = 1 - (1 - u) ** 5;
      const x = r.start + (r.end - r.start) * e;
      r.strip.style.transform = `translateX(${x}px)`;
      const w = r.win.clientWidth || 300;
      const idx = Math.round((w / 2 - TILE / 2 - x) / TILE);
      if (idx !== r.last) {
        r.last = idx;
        this.sounds.tick?.();
        r.win.classList.remove('tick');
        void r.win.offsetWidth;
        r.win.classList.add('tick');
      }
      if (u >= 1) this.stopReel(r);
      else all = false;
    }
    if (all && ts > Math.max(...this.reels.map((r) => r.duration)) + 0.3) this.reveal();
  }

  private stopReel(r: Reel): void {
    if (r.stopped) return;
    r.stopped = true;
    const w = r.win.clientWidth || 300;
    r.strip.style.transition = 'transform 0.25s ease-out';
    r.strip.style.transform = `translateX(${w / 2 - TILE / 2 - WIN * TILE}px)`;
    r.winTile.classList.add('win');
  }

  private reveal(): void {
    if (this.revealed) return;
    this.revealed = true;
    cancelAnimationFrame(this.raf);
    this.el.classList.remove('spinning');
    this.el.classList.add('revealed');
    const multi = this.view.items.length > 1;
    this.results.classList.toggle('multi', multi);
    this.results.replaceChildren(
      ...this.view.items.map((v) => {
        const card = h(
          'div.card.item-card',
          { 'data-rarity': String(v.rarity) },
          h('span.card-icon', {}, v.icon),
          h('span.card-title', {}, v.name),
          h('span.card-desc', {}, v.description),
          h('span.card-rarity', {}, v.rarityName),
        );
        if (v.owned > 0) card.append(h('span.card-badge', {}, `Şu an ${v.owned} → ${v.owned + 1}`));
        return card;
      }),
    );
    this.sounds.reveal?.(this.best);
    revealBurst(this.stage, this.layer, this.best, this.best >= 3 ? 'EFSANEVİ!' : '');
  }
}
