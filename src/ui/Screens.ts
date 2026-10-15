import { BALANCE } from '../data/balance';
import { EVOLUTIONS } from '../data/evolutions';
import type { HeroDef } from '../data/heroes';
import { ITEMS } from '../data/items';
import { TOME_INDEX, TOMES } from '../data/tomes';
import { WEAPON_INDEX, WEAPONS, weaponMaxLevel } from '../data/weapons';
import { RARITIES } from '../sim/progression/Rarity';
import type { SlotUsage, UpgradeView } from '../sim/progression/Upgrades';
import type { World } from '../sim/world/World';
import { ChestReel, type ChestView, type RewardSounds } from './ChestReel';
import { formatTime, h } from './dom';
import { revealBurst } from './rewardFx';

export interface EvolutionView {
  fromIcon: string;
  fromName: string;
  tomeIcon: string;
  icon: string;
  name: string;
  description: string;
}

export type GuideTab = 'items' | 'evolutions';

export interface HeroPicker {
  list: readonly HeroDef[];
  selected: string;
  onSelect: (id: string) => void;
}

export interface PactView {
  icon: string;
  name: string;
  boon: string;
  bane: string;
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
  /** Açık sandık çarkı (atlatma için). */
  private chest: ChestReel | null = null;

  constructor(parent: HTMLElement) {
    this.el = h('div.overlay');
    parent.append(this.el);
    this.hide();
  }

  hide(): void {
    this.endChest();
    this.el.replaceChildren();
    this.el.style.display = 'none';
  }

  private endChest(): void {
    this.chest?.destroy();
    this.chest = null;
  }

  private show(...children: Node[]): void {
    this.endChest();
    this.el.className = 'overlay';
    this.el.replaceChildren(...children);
    this.el.style.display = '';
  }

  showStart(onPlay: () => void, heroes?: HeroPicker): void {
    const play = h('button.btn.btn-primary', { 'data-testid': 'play' }, 'OYNA');
    play.addEventListener('click', onPlay);
    const picker = heroes ? heroPicker(heroes) : '';
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
      h('p.subtitle', {}, '3D survivors-like · v0.4'),
      h('p.lead', {}, 'Silahların otomatik saldırır. Hayatta kal, XP topla, güçlen.'),
      picker,
      controls,
      play,
    );
    this.show(panel);
    // Panel solda (dikey ekranda altta): sahnedeki kahraman görünsün.
    this.el.classList.add('start-overlay');
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
      if (o.hint) card.append(h('span.card-hint', {}, `★ ${o.hint}`));
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

  /** Sandık açılışı: dönen eşya şeritleri, nadirliğe göre açılış efekti, AL butonu. */
  showChest(view: ChestView, sounds: RewardSounds, onTake: () => void): void {
    const reel = new ChestReel(view, this.el, sounds, onTake);
    this.show(reel.el);
    this.chest = reel;
    reel.start();
  }

  /** Sandık animasyonu sürüyorsa atlatır (true); bittiyse false. */
  skipChest(): boolean {
    return this.chest?.skip() ?? false;
  }

  /** Sandıktan evrim: eski silah + kitap → yeni silah. */
  showEvolution(view: EvolutionView, onTake: () => void): void {
    const take = h(
      'button.btn.btn-primary',
      { 'data-testid': 'take' },
      'EVRİMLEŞTİR',
      h('span.keys-only', {}, ' (E)'),
    );
    take.addEventListener('click', onTake);
    const card = h(
      'div.card.item-card.evo-card',
      { 'data-rarity': '3' },
      h('span.evo-recipe', {}, `${view.fromIcon} + ${view.tomeIcon} →`),
      h('span.card-icon', {}, view.icon),
      h('span.card-title', {}, view.name),
      h('span.card-desc', {}, view.description),
      h('span.card-badge', {}, `★ ${view.fromName} evrimleşiyor`),
    );
    const host = h('div.evo-stage', {}, card);
    this.show(
      h(
        'div.panel.reward',
        { 'data-testid': 'evolution' },
        h('h2', {}, 'Evrim!'),
        host,
        h('div.buttons', {}, take),
      ),
    );
    revealBurst(host, this.el, 3, 'EVRİM!');
  }

  /** Lanet Sunağı: iki paktdan birini seç ya da reddet (uzaklaşıp dönünce aynı seçenekler gelir). */
  showPact(options: PactView[], onPick: (i: number) => void, onDecline: () => void): void {
    const cards = options.map((o, i) => {
      const card = h(
        'button.card.pact-card',
        { 'data-testid': `pact-${i}` },
        h('span.card-key', {}, String(i + 1)),
        h('span.card-icon', {}, o.icon),
        h('span.card-title', {}, o.name),
        h('span.pact-boon', {}, `▲ ${o.boon}`),
        h('span.pact-bane', {}, `▼ ${o.bane}`),
      );
      card.addEventListener('click', () => onPick(i));
      return card;
    });
    const decline = h(
      'button.btn.btn-small',
      { 'data-testid': 'decline' },
      'Reddet',
      h('span.keys-only', {}, ' (Esc)'),
    );
    decline.addEventListener('click', onDecline);
    this.show(
      h(
        'div.panel.levelup.pact',
        {},
        h('h2', {}, 'Lanet Sunağı'),
        h(
          'p.subtitle',
          {},
          'Güç kazan, bedelini kalıcı öde',
          h('span.keys-only', {}, ` (1–${options.length})`),
        ),
        h('div.cards', {}, ...cards),
        h('div.buttons', {}, decline),
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

  /** Rehber: eşyalar (nadirliğe göre gruplu) ve evrimler; sahip olunanlar vurgulu. */
  showGuide(world: World, onBack: () => void, tab: GuideTab = 'items'): void {
    const back = h('button.btn.btn-primary', { 'data-testid': 'guide-back' }, '← Geri');
    back.addEventListener('click', onBack);
    const tabs = (['items', 'evolutions'] as const).map((t) => {
      const b = h(
        `button.tab${t === tab ? '.active' : ''}`,
        { 'data-testid': `guide-${t}` },
        t === 'items' ? '🎁 Eşyalar' : '★ Evrimler',
      );
      b.addEventListener('click', () => this.showGuide(world, onBack, t));
      return b;
    });
    const body = tab === 'items' ? itemGuide(world) : evolutionGuide(world);
    this.show(
      h(
        'div.panel.guide',
        { 'data-testid': 'guide-panel' },
        h('h2', {}, 'Rehber'),
        h('div.tabs', {}, ...tabs),
        body,
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

function guideRow(
  icon: string,
  name: string,
  desc: string,
  mark: string,
  highlight: boolean,
  wideIcon = false,
): HTMLElement {
  return h(
    `li.guide-row${highlight ? '.owned' : ''}`,
    {},
    h(`span.guide-icon${wideIcon ? '.wide' : ''}`, {}, icon),
    h('span.guide-text', {}, h('b', {}, name), h('span', {}, desc)),
    mark ? h('span.guide-owned', {}, mark) : '',
  );
}

function itemGuide(world: World): HTMLElement {
  const groups = RARITIES.map((r, rarity) => {
    const rows = ITEMS.flatMap((d, i) => {
      if (d.rarity !== rarity) return [];
      const owned = world.itemCounts[i];
      return [guideRow(d.icon, d.name, d.description, owned > 0 ? `×${owned}` : '', owned > 0)];
    });
    return h(
      'section.guide-group',
      { 'data-rarity': String(rarity) },
      h('h3', {}, r.name),
      h('ul', {}, ...rows),
    );
  });
  return h(
    'div.guide-list',
    {},
    h('p.note', {}, 'Sandıklardan çıkar. Nadirlik zarını Şans artırır.'),
    ...groups,
  );
}

function evolutionGuide(world: World): HTMLElement {
  const rows = EVOLUTIONS.map((evo) => {
    const base = WEAPONS[WEAPON_INDEX[evo.weapon]];
    const tome = TOMES[TOME_INDEX[evo.tome]];
    const w = world.weapons.find((x) => x.def.id === evo.weapon || x.def.id === evo.def.id);
    const evolved = w?.def.id === evo.def.id;
    const ready = !!w && !evolved && world.canEvolve(w);
    return guideRow(
      `${base.icon}→${evo.def.icon}`,
      evo.def.name,
      `${base.name} (Sv. ${weaponMaxLevel(base)}) + ${tome.icon} ${tome.name}`,
      evolved ? '✓' : ready ? 'Hazır!' : '',
      evolved || ready,
      true,
    );
  });
  return h(
    'div.guide-list',
    {},
    h('p.note', {}, 'Silah maks seviyede ve eşleşen kitap sende varken açtığın sandık evrim verir.'),
    h('section.guide-group', { 'data-rarity': '3' }, h('ul', {}, ...rows)),
  );
}

/** Maceracı seçimi: seçilen karakter arkadaki sahnede hemen değişir. */
function heroPicker(p: HeroPicker): HTMLElement {
  const buttons = p.list.map((hero) => {
    const b = h(
      `button.hero-chip${hero.id === p.selected ? '.active' : ''}`,
      { 'data-testid': `hero-${hero.id}`, 'aria-pressed': String(hero.id === p.selected) },
      hero.name,
    );
    b.addEventListener('click', () => {
      for (const other of buttons) {
        other.classList.toggle('active', other === b);
        other.setAttribute('aria-pressed', String(other === b));
      }
      p.onSelect(hero.id);
    });
    return b;
  });
  return h('div.hero-picker', {}, h('span.hero-label', {}, 'Maceracın:'), ...buttons);
}
