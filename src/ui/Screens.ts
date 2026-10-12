import type { UpgradeView } from '../sim/progression/Upgrades';
import type { World } from '../sim/world/World';
import { formatTime, h } from './dom';

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

  showStart(onPlay: () => void, touch: boolean): void {
    const play = h('button.btn.btn-primary', { 'data-testid': 'play' }, 'OYNA');
    play.addEventListener('click', onPlay);
    const controls = h(
      'ul.controls',
      {},
      ...[
        ['WASD', 'Hareket'],
        ['Fare', 'Kamera (tıkla → kilitle)'],
        ['Space', 'Zıpla (havada tekrar: çift zıplama kitabıyla)'],
        ['Shift', 'Kay — yokuş aşağı hızlanırsın, kayarken zıpla!'],
        ['Q / E', 'Kamerayı döndür'],
        ['Esc', 'Duraklat'],
      ].map(([k, v]) => h('li', {}, h('kbd', {}, k), ` ${v}`)),
    );
    const panel = h(
      'div.panel.start',
      {},
      h('h1.title', {}, 'SPAWN'),
      h('p.subtitle', {}, '3D survivors-like · prototip v0.1'),
      h('p.lead', {}, 'Silahların otomatik saldırır. Hayatta kal, XP topla, güçlen.'),
      controls,
      play,
    );
    if (touch) {
      panel.append(
        h('p.note', {}, 'Dokunmatik kontroller yakında (M5). Şimdilik klavye + fare ile oynanır.'),
      );
    }
    this.show(panel);
  }

  showLevelUp(level: number, options: UpgradeView[], onPick: (i: number) => void): void {
    const cards = options.map((o, i) => {
      const card = h(
        'button.card',
        { 'data-testid': `card-${i}` },
        h('span.card-key', {}, String(i + 1)),
        h('span.card-icon', {}, o.icon),
        h('span.card-title', {}, o.title),
        h('span.card-badge', {}, o.badge),
        h('span.card-desc', {}, o.description),
      );
      card.addEventListener('click', () => onPick(i));
      return card;
    });
    this.show(
      h(
        'div.panel.levelup',
        {},
        h('h2', {}, `Seviye ${level}!`),
        h('p.subtitle', {}, 'Bir yükseltme seç (1 / 2 / 3)'),
        h('div.cards', {}, ...cards),
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
