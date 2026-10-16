import { BALANCE } from '../data/balance';
import { EVOLUTIONS } from '../data/evolutions';
import type { HeroDef } from '../data/heroes';
import { ITEMS } from '../data/items';
import { TOME_INDEX, TOMES } from '../data/tomes';
import { WEAPON_INDEX, WEAPONS, weaponMaxLevel } from '../data/weapons';
import { RARITIES } from '../sim/progression/Rarity';
import type { SlotUsage, UpgradeView } from '../sim/progression/Upgrades';
import type { RunSummary } from '../sim/world/RunStats';
import type { World } from '../sim/world/World';
import { ChestReel, type ChestView, type RewardSounds } from './ChestReel';
import { formatTime, h } from './dom';
import type { RunRecord } from './records';
import { revealBurst } from './rewardFx';
import { buildIcons, buildPanel, statList, summaryRows, weaponTable } from './runSummary';

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

/** Duraklatma ekranındaki ses ayarları (AudioManager'a bağlanır). */
export interface AudioControls {
  sfx: number;
  music: number;
  muted: boolean;
  setVolume(kind: 'sfx' | 'music', v: number): void;
  toggleMute(): boolean;
}

export interface LevelUpActions {
  pick: (i: number) => void;
  banish: (i: number) => void;
  reroll: () => void;
  skip: () => void;
}

export interface PauseActions {
  resume: () => void;
  restart: () => void;
  menu: () => void;
}

export interface EndActions {
  restart: () => void;
  menu: () => void;
}

/** Oyun sonunda kalıcı ilerleme satırı (gümüş, açılanlar). */
export interface EndExtras {
  record?: { best: RunRecord; isNew: boolean };
  /** Ek satırlar (ör. "+73 🥈 gümüş"). */
  lines?: (Node | string)[];
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
  /** Alt ekranın (rehber, onay) Esc ile döneceği yer. */
  private backFn: (() => void) | null = null;

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
    this.backFn = null;
    this.el.className = 'overlay';
    this.el.replaceChildren(...children);
    this.el.style.display = '';
  }

  /** Esc: açık alt ekrandan geri döner (döndüyse true). */
  back(): boolean {
    const fn = this.backFn;
    if (!fn) return false;
    fn();
    return true;
  }

  /** Evet/hayır onayı (Esc = hayır). */
  showConfirm(title: string, text: string, yes: string, onYes: () => void, onNo: () => void): void {
    const ok = h('button.btn.btn-danger', { 'data-testid': 'confirm-yes' }, yes);
    ok.addEventListener('click', onYes);
    const cancel = h('button.btn.btn-primary', { 'data-testid': 'confirm-no' }, 'Vazgeç');
    cancel.addEventListener('click', onNo);
    this.show(
      h('div.panel.confirm', {}, h('h2', {}, title), h('p.lead', {}, text), h('div.buttons', {}, cancel, ok)),
    );
    this.backFn = onNo;
  }

  /** Beklenmeyen hata ya da grafik bağlamı kaybı: oyun donmak yerine burada durur. */
  showError(title: string, detail: string, actions: { label: string; run: () => void }[]): void {
    const buttons = actions.map((a, i) => {
      const b = h(`button.btn${i === 0 ? '.btn-primary' : ''}`, {}, a.label);
      b.addEventListener('click', a.run);
      return b;
    });
    this.show(
      h(
        'div.panel.error-panel',
        { 'data-testid': 'error' },
        h('h2', {}, title),
        detail ? h('p.note.error-detail', {}, detail) : '',
        h('div.buttons', {}, ...buttons),
      ),
    );
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
      h('p.subtitle', {}, '3D survivors-like · v0.5'),
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
      if (charges.banishes > 0 && o.banishable) {
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
      { 'data-testid': 'reroll', 'data-sfx': 'none' },
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

  showPause(world: World, actions: PauseActions, audio?: AudioControls): void {
    const resume = h('button.btn.btn-primary', { 'data-testid': 'resume' }, 'DEVAM');
    resume.addEventListener('click', actions.resume);
    const guide = h('button.btn', { 'data-testid': 'guide' }, '📖 Rehber');
    guide.addEventListener('click', () => this.showGuide(world, () => this.showPause(world, actions, audio)));
    const restart = h('button.btn', { 'data-testid': 'restart-run' }, 'Yeniden Başla');
    restart.addEventListener('click', actions.restart);
    const menu = h('button.btn', { 'data-testid': 'to-menu' }, '🏠 Ana Menü');
    menu.addEventListener('click', actions.menu);
    this.show(
      h(
        'div.panel.pause',
        {},
        h('h2', {}, 'Duraklatıldı'),
        buildPanel(world),
        audio ? audioSettings(audio) : '',
        h('div.buttons', {}, resume, guide, restart, menu),
      ),
    );
  }

  /**
   * Final boss yenildi: koşunun özeti ve seçim. "Kan Ayı'na devam" varsayılan (Enter/E), "Koşuyu
   * bitir" koşuyu zaferle kapatır.
   */
  showVictory(summary: RunSummary, onContinue: () => void, onFinish: () => void, note = ''): void {
    const go = h(
      'button.btn.btn-primary',
      { 'data-testid': 'victory-continue' },
      "🌕 Kan Ayı'na devam",
      h('span.keys-only', {}, ' (E)'),
    );
    go.addEventListener('click', onContinue);
    const finish = h('button.btn', { 'data-testid': 'victory-finish' }, '🏁 Koşuyu bitir');
    finish.addEventListener('click', onFinish);
    const first = summary.victories <= 1;
    const host = h(
      'div.victory-stage',
      {},
      h('p.victory-sub', {}, first ? 'Kemik Kral yenildi!' : `Kan Ayı ${summary.cycle - 1} yenildi!`),
    );
    this.show(
      h(
        'div.panel.victory',
        { 'data-testid': 'victory' },
        h('h2.victory-title', {}, first ? 'ZAFER!' : 'KANLI ZAFER!'),
        host,
        // "Ulaşılan" satırı yok: Kan Ayı dünyada zaten başladı, ama oyuncu henüz seçmedi.
        statList(summaryRows(summary).filter(([k]) => k !== 'Ulaşılan' && k !== 'Altın')),
        weaponTable(summary),
        h(
          'p.lead',
          {},
          'Devam edersen dünya kızıl geceye döner: düşmanlar güçlenir, boss\'lar "Kanlı" hâlleriyle gelir.',
        ),
        note ? h('p.note', {}, note) : '',
        h('div.buttons', {}, go, finish),
      ),
    );
    revealBurst(host, this.el, 3, 'ZAFER!');
    go.focus();
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
    this.backFn = onBack;
  }

  /** Koşu sonu: sonuca göre başlık, özet, silah başına hasar, rekor ve kalıcı ilerleme. */
  showGameOver(summary: RunSummary, actions: EndActions, extras: EndExtras = {}): void {
    const again = h('button.btn.btn-primary', { 'data-testid': 'restart' }, 'TEKRAR OYNA');
    again.addEventListener('click', actions.restart);
    const menu = h('button.btn', { 'data-testid': 'end-menu' }, '🏠 Ana Menü');
    menu.addEventListener('click', actions.menu);
    const rows = summaryRows(summary);
    const record = extras.record;
    if (record && !record.isNew) {
      const b = record.best;
      rows.push(['En iyi', `${formatTime(b.time)}${b.cycle > 1 ? ` · Kan Ayı ${b.cycle}` : ''}`]);
    }
    const badge = record?.isNew ? h('p.record-badge', { 'data-testid': 'record' }, '🏆 Yeni rekor!') : '';
    const title =
      summary.outcome === 'victory' ? 'Zafer!' : summary.outcome === 'quit' ? 'Koşu bırakıldı' : 'Öldün!';
    this.show(
      h(
        `div.panel.gameover.${summary.outcome}`,
        { 'data-testid': 'gameover' },
        h('h2', {}, title),
        badge,
        ...(extras.lines ?? []).map((l) => h('p.end-line', {}, l)),
        statList(rows),
        weaponTable(summary),
        buildIcons(summary),
        h('div.buttons', {}, again, menu),
      ),
    );
  }
}

/** Efekt ve müzik kaydırıcıları + sessiz düğmesi. */
function audioSettings(a: AudioControls): HTMLElement {
  const slider = (kind: 'sfx' | 'music', label: string, value: number) => {
    const input = h('input', {
      type: 'range',
      min: '0',
      max: '100',
      value: String(Math.round(value * 100)),
      'data-testid': `vol-${kind}`,
      'aria-label': label,
    });
    input.addEventListener('input', () => a.setVolume(kind, Number(input.value) / 100));
    return h('label.audio-row', {}, h('span', {}, label), input);
  };
  const mute = h('button.btn.btn-small', { 'data-testid': 'mute' }, a.muted ? '🔇 Sesi aç' : '🔊 Sessiz');
  mute.addEventListener('click', () => {
    mute.textContent = a.toggleMute() ? '🔇 Sesi aç' : '🔊 Sessiz';
  });
  return h(
    'div.audio-settings',
    {},
    slider('sfx', '🔔 Efekt', a.sfx),
    slider('music', '🎵 Müzik', a.music),
    h('div.audio-mute', {}, mute, h('span.keys-only.note', {}, 'M tuşu')),
  );
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
