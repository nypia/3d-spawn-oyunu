import type { UpgradeView } from '../sim/progression/Upgrades';
import type { World } from '../sim/world/World';
import { formatTime, h } from './dom';

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
      h('p.subtitle', {}, '3D survivors-like · prototip v0.1'),
      h('p.lead', {}, 'Silahların otomatik saldırır. Hayatta kal, XP topla, güçlen.'),
      controls,
      play,
    );
    this.show(panel);
  }

  showLevelUp(level: number, options: UpgradeView[], actions: LevelUpActions, charges: LevelUpCharges): void {
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
        h('div.cards', {}, ...cards),
        h('div.buttons', {}, reroll, skip),
        banInfo,
      ),
    );
  }

  showPause(onResume: () => void, onRestart: () => void): void {
    const resume = h('button.btn.btn-primary', {}, 'DEVAM');
    resume.addEventListener('click', onResume);
    const restart = h('button.btn', {}, 'Yeniden Başla');
    restart.addEventListener('click', onRestart);
    this.show(h('div.panel', {}, h('h2', {}, 'Duraklatıldı'), h('div.buttons', {}, resume, restart)));
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
