import type { HeroDef } from '../data/heroes';
import type { MetaUpgradeDef } from '../data/metaUpgrades';
import { WEAPON_INDEX, WEAPONS } from '../data/weapons';
import type { RunRecord } from '../meta/save';
import { formatTime, h } from './dom';

export interface MenuHero {
  def: HeroDef;
  unlocked: boolean;
  /** Önizlenen (seçili ya da kilitli olup bakılan). */
  selected: boolean;
}

export interface MenuView {
  version: string;
  silver: number;
  /** Depolama yok: ilerleme yalnızca bu oturumda. */
  persistent: boolean;
  heroes: MenuHero[];
  best: RunRecord | null;
}

export interface MenuActions {
  play: () => void;
  selectHero: (id: string) => void;
  unlockHero: (id: string) => void;
  shop: () => void;
  settings?: () => void;
}

const KEYS = [
  ['WASD', 'Hareket'],
  ['Fare', 'Kamera (tıkla → kilitle)'],
  ['Space', 'Zıpla'],
  ['Shift', 'Kay: yokuş aşağı hızlanırsın, kayarken zıpla'],
  ['Q / E', 'Kamerayı döndür'],
  ['1–4 · R', 'Kart seç · yenile'],
  ['Esc · M', 'Duraklat · sessiz'],
];
const TOUCH_KEYS = [
  ['Sol yarı', 'Sürükle → koş'],
  ['Sağ yarı', 'Sürükle → kamera'],
  ['ZIPLA', 'Zıpla'],
  ['KAY', 'Basılı tut → kay, yokuş aşağı hızlan'],
  ['II', 'Duraklat'],
];

/** Gümüş bakiyesi rozeti. */
export function silverChip(silver: number, persistent = true): HTMLElement {
  return h(
    'div.silver-chip',
    { 'data-testid': 'silver', title: persistent ? 'Gümüş' : 'İlerleme kaydedilemiyor (gizli pencere?)' },
    `🥈 ${silver.toLocaleString('tr-TR')}`,
    persistent ? '' : h('small', {}, ' · kaydedilemiyor'),
  );
}

function heroCard(m: MenuHero, onSelect: (id: string) => void): HTMLElement {
  const d = m.def;
  const weapon = WEAPONS[WEAPON_INDEX[d.weapon]];
  const lock = m.unlocked
    ? ''
    : h(
        'span.hero-lock',
        {},
        d.unlock.kind === 'silver'
          ? `🔒 ${d.unlock.cost} 🥈`
          : d.unlock.kind === 'achievement'
            ? `🔒 ${d.unlock.text}`
            : '',
      );
  const card = h(
    `button.hero-card${m.selected ? '.active' : ''}${m.unlocked ? '' : '.locked'}`,
    { 'data-testid': `hero-${d.id}`, 'aria-pressed': String(m.selected) },
    h('span.hero-weapon', { title: weapon?.name ?? '' }, weapon?.icon ?? '?'),
    h('span.hero-name', {}, d.name, h('small', {}, ` · ${d.title}`)),
    h('span.hero-passive', {}, `${weapon?.name ?? ''} · ${d.passiveText}`),
    lock,
  );
  card.addEventListener('click', () => onSelect(d.id));
  return card;
}

/** Ana menü: kahramanlar, gümüş, rekor, OYNA / kahraman aç, dükkân ve ayarlar. */
export function menuPanel(v: MenuView, a: MenuActions): HTMLElement {
  const sel = v.heroes.find((x) => x.selected) ?? v.heroes[0];
  let primary: HTMLButtonElement;
  if (sel.unlocked) {
    primary = h('button.btn.btn-primary', { 'data-testid': 'play' }, 'OYNA');
    primary.addEventListener('click', a.play);
  } else if (sel.def.unlock.kind === 'silver') {
    const cost = sel.def.unlock.cost;
    primary = h(
      'button.btn.btn-primary',
      { 'data-testid': 'unlock-hero', 'data-sfx': 'none' },
      `🔒 ${sel.def.name}'yı aç · ${cost} 🥈`,
    );
    primary.disabled = v.silver < cost;
    primary.addEventListener('click', () => a.unlockHero(sel.def.id));
  } else {
    primary = h(
      'button.btn.btn-primary',
      { 'data-testid': 'locked' },
      `🔒 ${sel.def.unlock.kind === 'achievement' ? sel.def.unlock.text : ''}`,
    );
    primary.disabled = true;
  }
  const shop = h('button.btn.btn-small', { 'data-testid': 'shop' }, '🛒 Dükkân');
  shop.addEventListener('click', a.shop);
  const side: HTMLElement[] = [shop];
  if (a.settings) {
    const settings = h('button.btn.btn-small', { 'data-testid': 'settings' }, '⚙️ Ayarlar');
    settings.addEventListener('click', a.settings);
    side.push(settings);
  }
  const b = v.best;
  const best = b
    ? h(
        'p.menu-best',
        { 'data-testid': 'menu-best' },
        `🏆 En iyi: ${formatTime(b.time)}${b.cycle > 1 ? ` · Kan Ayı ${b.cycle}` : ''}${b.victory ? ' · Zafer' : ''}`,
      )
    : '';
  const list = (rows: string[][], cls: string) =>
    h(`ul.controls.${cls}`, {}, ...rows.map(([k, val]) => h('li', {}, h('kbd', {}, k), ` ${val}`)));
  const controls = h(
    'details.menu-controls',
    {},
    h('summary', {}, 'Kontroller'),
    list(KEYS, 'controls-keys'),
    list(TOUCH_KEYS, 'controls-touch'),
  );
  return h(
    'div.panel.start.menu',
    {},
    h('h1.title', {}, 'SPAWN'),
    h(
      'div.menu-head',
      {},
      h('p.subtitle', {}, `3D survivors-like · v${v.version}`),
      silverChip(v.silver, v.persistent),
    ),
    h('div.hero-grid', {}, ...v.heroes.map((m) => heroCard(m, a.selectHero))),
    best,
    primary,
    h('div.buttons.menu-side', {}, ...side),
    controls,
  );
}

export interface ShopItem {
  def: MetaUpgradeDef;
  rank: number;
  /** Sıradaki rank fiyatı (null = maks). */
  cost: number | null;
}

/** Dükkân: kalıcı güçler (rank noktaları, fiyat), gümüş bakiyesi. */
export function shopPanel(
  silver: number,
  items: ShopItem[],
  actions: { buy: (id: string) => void; back: () => void },
  persistent = true,
): HTMLElement {
  const cards = items.map((it) => {
    const max = it.def.costs.length;
    const dots = h(
      'span.shop-dots',
      {},
      ...Array.from({ length: max }, (_, k) => h(`span.dot${k < it.rank ? '.on' : ''}`)),
    );
    const card = h(
      `button.shop-card${it.cost === null ? '.maxed' : ''}`,
      { 'data-testid': `buy-${it.def.id}`, 'data-sfx': 'none' },
      h('span.shop-icon', {}, it.def.icon),
      h('span.shop-name', {}, it.def.name),
      h('span.shop-text', {}, it.def.text),
      dots,
      h('span.shop-cost', {}, it.cost === null ? 'MAKS' : `${it.cost} 🥈`),
    );
    card.disabled = it.cost === null || it.cost > silver;
    card.addEventListener('click', () => actions.buy(it.def.id));
    return card;
  });
  const back = h('button.btn.btn-primary', { 'data-testid': 'shop-back' }, '← Geri');
  back.addEventListener('click', actions.back);
  return h(
    'div.panel.shop',
    { 'data-testid': 'shop-panel' },
    h('h2', {}, 'Dükkân'),
    silverChip(silver, persistent),
    h('p.note', {}, 'Gümüş koşu sonunda kazanılır: süre, öldürme, seviye, boss, zafer ve kalan altın.'),
    h('div.shop-grid', {}, ...cards),
    h('div.buttons', {}, back),
  );
}
