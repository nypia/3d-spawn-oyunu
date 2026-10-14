import { BALANCE } from '../data/balance';
import { ITEMS } from '../data/items';
import { RARITIES } from '../sim/progression/Rarity';
import type { SlotUsage, UpgradeView } from '../sim/progression/Upgrades';
import type { World } from '../sim/world/World';
import { formatTime, h } from './dom';

export interface ItemView {
  title: string;
  icon: string;
  name: string;
  description: string;
  rarity: number;
  rarityName: string;
  owned: number;
}

export interface ShrineView {
  icon: string;
  title: string;
  rarity: number;
  rarityName: string;
}

export interface LevelUpActions {
  pick: (i: number) => void;
  banish: (i: number) => void;
  reroll: () => void;
  skip: () => void;
}

export interface LevelUpCharges {
  rerolls: number;
  banishes: number;
  skips: number;
}

/** Tam ekran katmanlar: başlangıç, seviye atlama, duraklatma, oyun sonu. */
export class Screens {
  private readonly el: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.el = h('div.overlay');
    parent.append(this.el);
    this.hide();
  }

  hide(): void {
    this.el.replaceChildren();
    this.el.style.display = 'none';
  }

  private show(...children: Node[]): void {
    this.el.replaceChildren(...children);
    this.el.style.display = '';
  }

  showStart(onPlay: () => void): void {
    const play = h('button.btn.btn-primary', { 'data-testid': 'play' }, 'OYNA');
    play.addEventListener('click', onPlay);
    const keys = [
      ['WASD', 'Hareket'],
      ['Fare', 'Kamera (tıkla → kilitle)'],
      ['Space', 'Zıpla'],
      ['Shift', 'Kay: yokuş aşağı hızlanırsın, kayarken zıpla'],
      ['Q / E', 'Kamerayı döndür'],
      ['Esc', 'Duraklat'],
    ];
    const touchKeys = [
      ['Sol yarı', 'Sürükle → koş'],
      ['Sağ yarı', 'Sürükle → kamera'],
      ['ZIPLA', 'Zıpla'],
      ['KAY', 'Basılı tut → kay, yokuş aşağı hızlan'],
      ['II', 'Duraklat'],
    ];
    const list = (rows: string[][], cls: string) =>
      h(`ul.controls.${cls}`, {}, ...rows.map(([k, v]) => h('li', {}, h('kbd', {}, k), ` ${v}`)));
    // Hangisinin görüneceğine CSS karar verir (body.touch); ilk dokunuşta değişir.
    const controls = h('div', {}, list(keys, 'controls-keys'), list(touchKeys, 'controls-touch'));
    const panel = h(
      'div.panel.start',
      {},
      h('h1.title', {}, 'SPAWN'),
      h('p.subtitle', {}, '3D survivors-like · prototip v0.2'),
      h('p.lead', {}, 'Silahların otomatik saldırır. Hayatta kal, XP topla, güçlen.'),
      controls,
      play,
    );
    this.show(panel);
  }

  showLevelUp(
    level: number,
    options: UpgradeView[],
    slots: SlotUsage,
    actions: LevelUpActions,
    charges: LevelUpCharges,
  ): void {
    const cards = options.map((o, i) => {
      const card = h(
        'button.card',
        { 'data-testid': `card-${i}`, 'data-rarity': o.rarity === null ? 'none' : String(o.rarity) },
        h('span.card-key', {}, String(i + 1)),
        h('span.card-icon', {}, o.icon),
        h('span.card-title', {}, o.title),
        h('span.card-badge', {}, o.badge),
        h('span.card-desc', {}, o.description),
      );
      if (o.rarityName) card.append(h('span.card-rarity', {}, o.rarityName));
      card.addEventListener('click', () => actions.pick(i));
      if (charges.banishes > 0 && o.badge !== 'İYİLEŞME') {
        const ban = h(
          'span.card-ban',
          { role: 'button', 'aria-label': `${o.title} kartını yasakla`, 'data-testid': `ban-${i}` },
          '✕',
        );
        ban.addEventListener('click', (e) => {
          e.stopPropagation();
          actions.banish(i);
        });
        card.append(ban);
      }
      return card;
    });
    const reroll = h(
      'button.btn.btn-small',
      { 'data-testid': 'reroll' },
      `🎲 Yenile (${charges.rerolls})`,
      h('span.keys-only', {}, ' R'),
    );
    reroll.disabled = charges.rerolls <= 0;
    reroll.addEventListener('click', actions.reroll);
    const skip = h('button.btn.btn-small', { 'data-testid': 'skip' }, `⏭ Atla +5 altın (${charges.skips})`);
    skip.disabled = charges.skips <= 0;
    skip.addEventListener('click', actions.skip);
    const banInfo =
      charges.banishes > 0
        ? h('p.note', {}, `Kartın köşesindeki ✕ ile yasakla: bir daha çıkmaz (${charges.banishes} hak)`)
        : '';
    this.show(
      h(
        'div.panel.levelup',
        {},
        h('h2', {}, `Seviye ${level}!`),
        h('p.subtitle', {}, 'Bir yükseltme seç', h('span.keys-only', {}, ` (1–${options.length})`)),
        slotLine(slots),
        h('div.cards', {}, ...cards),
        h('div.buttons', {}, reroll, skip),
        banInfo,
      ),
    );
  }

  /** Sandıktan çıkan eşya: nadirlik renkli kart + AL butonu. */
  showItem(view: ItemView, onTake: () => void): void {
    const take = h(
      'button.btn.btn-primary',
      { 'data-testid': 'take' },
      'AL',
      h('span.keys-only', {}, ' (E)'),
    );
    take.addEventListener('click', onTake);
    const card = h(
      'div.card.item-card',
      { 'data-rarity': String(view.rarity) },
      h('span.card-icon', {}, view.icon),
      h('span.card-title', {}, view.name),
      h('span.card-desc', {}, view.description),
      h('span.card-rarity', {}, view.rarityName),
    );
    if (view.owned > 0) card.append(h('span.card-badge', {}, `Şu an ${view.owned} adet → ${view.owned + 1}`));
    this.show(h('div.panel.reward', {}, h('h2', {}, view.title), card, h('div.buttons', {}, take)));
  }

  /** Tapınak doldu: üç bonustan birini seç. */
  showShrine(options: ShrineView[], onPick: (i: number) => void): void {
    const cards = options.map((o, i) => {
      const card = h(
        'button.card',
        { 'data-testid': `shrine-${i}`, 'data-rarity': String(o.rarity) },
        h('span.card-key', {}, String(i + 1)),
        h('span.card-icon', {}, o.icon),
        h('span.card-title', {}, o.title),
        h('span.card-rarity', {}, o.rarityName),
      );
      card.addEventListener('click', () => onPick(i));
      return card;
    });
    this.show(
      h(
        'div.panel.levelup',
        {},
        h('h2', {}, 'Tapınak kutsaması'),
        h('p.subtitle', {}, 'Kalıcı bir bonus seç', h('span.keys-only', {}, ` (1–${options.length})`)),
        h('div.cards', {}, ...cards),
      ),
    );
  }

  showPause(world: World, onResume: () => void, onRestart: () => void): void {
    const resume = h('button.btn.btn-primary', {}, 'DEVAM');
    resume.addEventListener('click', onResume);
    const guide = h('button.btn', { 'data-testid': 'guide' }, '📖 Rehber');
    guide.addEventListener('click', () =>
      this.showGuide(world, () => this.showPause(world, onResume, onRestart)),
    );
    const restart = h('button.btn', {}, 'Yeniden Başla');
    restart.addEventListener('click', onRestart);
    this.show(h('div.panel', {}, h('h2', {}, 'Duraklatıldı'), h('div.buttons', {}, resume, guide, restart)));
  }

  /** Rehber: sandık eşyaları nadirliğe göre gruplu; sahip olunanlar vurgulu. */
  showGuide(world: World, onBack: () => void): void {
    const back = h('button.btn.btn-primary', { 'data-testid': 'guide-back' }, '← Geri');
    back.addEventListener('click', onBack);
    const groups = RARITIES.map((r, rarity) => {
      const rows = ITEMS.flatMap((d, i) => {
        if (d.rarity !== rarity) return [];
        const owned = world.itemCounts[i];
        return [
          h(
            `li.guide-row${owned > 0 ? '.owned' : ''}`,
            {},
            h('span.guide-icon', {}, d.icon),
            h('span.guide-text', {}, h('b', {}, d.name), h('span', {}, d.description)),
            owned > 0 ? h('span.guide-owned', {}, `×${owned}`) : '',
          ),
        ];
      });
      return h(
        'section.guide-group',
        { 'data-rarity': String(rarity) },
        h('h3', {}, r.name),
        h('ul', {}, ...rows),
      );
    });
    this.show(
      h(
        'div.panel.guide',
        { 'data-testid': 'guide-panel' },
        h('h2', {}, 'Rehber · Eşyalar'),
        h('p.subtitle', {}, 'Sandıklardan çıkar. Nadirlik zarını Şans artırır.'),
        h('div.guide-list', {}, ...groups),
        h('div.buttons', {}, back),
      ),
    );
  }

  showGameOver(world: World, onRestart: () => void): void {
    const again = h('button.btn.btn-primary', { 'data-testid': 'restart' }, 'TEKRAR OYNA');
    again.addEventListener('click', onRestart);
    const stats = h(
      'dl.stats',
      {},
      ...[
        ['Süre', formatTime(world.time)],
        ['Seviye', String(world.level)],
        ['Öldürülen', String(world.kills)],
        ['Toplam hasar', Math.round(world.damageDealt).toLocaleString('tr-TR')],
      ].flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]),
    );
    this.show(h('div.panel.gameover', {}, h('h2', {}, 'Öldün!'), stats, again));
  }
}

/** "⚔️ Silah 3/4 · 📖 Kitap 2/4": dolu yuvalar; dolunca yalnızca sahip olunanlar güçlenir. */
function slotLine(slots: SlotUsage): HTMLElement {
  const L = BALANCE.levelUp;
  const part = (icon: string, name: string, used: number, max: number) =>
    h(`span.slot-count${used >= max ? '.full' : ''}`, {}, `${icon} ${name} ${used}/${max}`);
  return h(
    'p.slot-line',
    { 'data-testid': 'slot-line' },
    part('⚔️', 'Silah', slots.weapons, L.weaponSlots),
    ' · ',
    part('📖', 'Kitap', slots.tomes, L.tomeSlots),
  );
}
