import { ITEMS } from '../data/items';
import { PACTS } from '../data/pacts';
import { TOMES } from '../data/tomes';
import type { RunSummary } from '../sim/world/RunStats';
import type { World } from '../sim/world/World';
import { formatTime, h } from './dom';

const num = (v: number) => Math.round(v).toLocaleString('tr-TR');

/** "Kısa sayı": 12 400 → 12,4B (tabloda sütun genişliği sabit kalsın). */
function short(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1).replace('.', ',')}Mr`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace('.', ',')}M`;
  if (v >= 1e4) return `${(v / 1e3).toFixed(1).replace('.', ',')}B`;
  return num(v);
}

/** Tanım listesi (Süre: 12:30 …). */
export function statList(rows: [string, string][]): HTMLElement {
  return h('dl.stats', {}, ...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
}

/** Zaferle bitirildiyse yenilen döngü, değilse içinde olunan döngü. */
function reached(s: RunSummary): string {
  if (s.outcome === 'victory')
    return s.cycle > 2 ? `🏆 Kan Ayı ${s.cycle - 1} tamamlandı` : '🏆 Gün 1 tamamlandı';
  return s.cycle > 1 ? `🌕 Kan Ayı ${s.cycle}` : '☀️ Gün 1';
}

/** Oyun sonu özetinin ana satırları. */
export function summaryRows(s: RunSummary): [string, string][] {
  const rows: [string, string][] = [
    ['Süre', formatTime(s.time)],
    ['Ulaşılan', reached(s)],
    ['Seviye', String(s.level)],
    ['Öldürülen', `${num(s.kills)}${s.eliteKills > 0 ? ` (${s.eliteKills} elit)` : ''}`],
    ['Boss', s.bosses.length > 0 ? `${s.bosses.length} 👑` : '—'],
    ['Toplam hasar', num(s.damage)],
    ['Alınan hasar', num(s.damageTaken)],
    ['Altın', `${num(s.goldEarned)} 🪙 · ${s.chestsOpened} sandık`],
  ];
  if (s.goblins > 0) rows.push(['Goblin', `${s.goblins} 💰`]);
  return rows;
}

/** Silah başına hasar tablosu: ikon, ad, seviye, hasar, pay çubuğu, öldürme, DPS. */
export function weaponTable(s: RunSummary): HTMLElement {
  const total = Math.max(1, s.weapons.reduce((a, w) => a + w.damage, 0) + s.otherDamage);
  const row = (icon: string, name: string, lvl: string, dmg: number, kills: string, dps: string) => {
    const pct = (dmg / total) * 100;
    return h(
      'tr',
      {},
      h('td.wt-icon', {}, icon),
      h('td.wt-name', {}, name, lvl ? h('span.wt-level', {}, lvl) : ''),
      h(
        'td.wt-dmg',
        {},
        h('span', {}, short(dmg)),
        h('span.wt-bar', {}, h('span.wt-fill', { style: `width:${pct.toFixed(1)}%` })),
      ),
      h('td.wt-num', {}, kills),
      h('td.wt-num', {}, dps),
    );
  };
  const rows = s.weapons.map((w) =>
    row(
      w.icon,
      w.evolved ? `${w.name} ★` : w.name,
      w.evolved ? '' : `Sv.${w.level}`,
      w.damage,
      short(w.kills),
      short(w.dps),
    ),
  );
  if (s.otherDamage > 0) rows.push(row('✨', 'Eşyalar ve diğer', '', s.otherDamage, '', ''));
  return h(
    'table.weapon-table',
    { 'data-testid': 'weapon-table' },
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', {}),
        h('th', {}, 'Silah'),
        h('th', {}, 'Hasar'),
        h('th', {}, 'Öldürme'),
        h('th', {}, 'DPS'),
      ),
    ),
    h('tbody', {}, ...rows),
  );
}

/** Alınan paktlar, kitaplar ve eşyalar: tek satırlık ikon listesi. */
export function buildIcons(s: RunSummary): HTMLElement {
  const chip = (icon: string, title: string, badge = '') =>
    h('span.build-chip', { title }, icon, badge ? h('small', {}, badge) : '');
  return h(
    'div.build-icons',
    {},
    ...s.tomes.map((t) => chip(t.icon, t.name, String(t.level))),
    ...s.items.map((it) => chip(it.icon, it.name, it.count > 1 ? `×${it.count}` : '')),
    ...s.pacts.map((p) => chip(p.icon, `Pakt: ${p.name}`, '⛧')),
  );
}

const STAT_ROWS: [string, (w: World) => string][] = [
  ['❤️ Can', (w) => `${Math.ceil(w.player.hp)}/${Math.round(w.player.maxHp)}`],
  ['💚 Yenilenme', (w) => `${w.stats.get('regen').toFixed(1)}/sn`],
  ['🛡️ Zırh', (w) => w.stats.get('armor').toFixed(0)],
  ['⚔️ Hasar', (w) => `×${w.stats.get('damage').toFixed(2)}`],
  ['⚡ Saldırı hızı', (w) => `×${w.stats.get('attackSpeed').toFixed(2)}`],
  ['🎯 Mermi', (w) => `+${w.stats.get('projectileCount').toFixed(0)}`],
  ['💥 Alan', (w) => `×${w.stats.get('area').toFixed(2)}`],
  ['👟 Hız', (w) => w.stats.get('moveSpeed').toFixed(1)],
  ['🧲 Toplama', (w) => `${w.stats.get('pickupRange').toFixed(1)} m`],
  ['🍀 Şans', (w) => w.stats.get('luck').toFixed(2)],
  ['📘 XP', (w) => `×${w.stats.get('xpGain').toFixed(2)}`],
  ['☠️ Lanet', (w) => w.stats.get('curse').toFixed(2)],
];

/** Duraklatma ekranındaki "Yapı": silahlar (hasarıyla), kitaplar, eşyalar, paktlar ve temel stat'lar. */
export function buildPanel(w: World): HTMLElement {
  const weapons = w.weapons.map((inst, k) =>
    h(
      'li.build-row',
      { title: inst.def.description },
      h('span.build-icon', {}, inst.def.icon),
      h('b', {}, inst.def.evolvesFrom ? `${inst.def.name} ★` : inst.def.name),
      h('span.build-sub', {}, inst.def.evolvesFrom ? 'Evrim' : `Sv.${inst.level}`),
      h('span.build-sub', {}, `${short(w.run.weaponDamage[k])} hasar`),
    ),
  );
  const extras: HTMLElement[] = [];
  TOMES.forEach((d, i) => {
    if (w.tomeLevels[i] > 0)
      extras.push(h('span.build-chip', { title: d.name }, d.icon, h('small', {}, String(w.tomeLevels[i]))));
  });
  ITEMS.forEach((d, i) => {
    const n = w.itemCounts[i];
    if (n > 0)
      extras.push(
        h(
          'span.build-chip',
          { title: `${d.name}: ${d.description}` },
          d.icon,
          n > 1 ? h('small', {}, `×${n}`) : '',
        ),
      );
  });
  for (const k of w.landmarks.pacts) {
    const p = PACTS[k];
    extras.push(h('span.build-chip', { title: `${p.name}: ${p.boonText} / ${p.baneText}` }, p.icon));
  }
  return h(
    'div.build-panel',
    { 'data-testid': 'build-panel' },
    h('ul.build-list', {}, ...weapons),
    extras.length ? h('div.build-icons', {}, ...extras) : '',
    h('dl.build-stats', {}, ...STAT_ROWS.flatMap(([k, f]) => [h('dt', {}, k), h('dd', {}, f(w))])),
  );
}
