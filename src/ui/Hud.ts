import { ITEMS } from '../data/items';
import { TOMES } from '../data/tomes';
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
  private readonly kills = h('span.hud-kill-count');
  private readonly gold = h('span.hud-gold-count', { 'data-testid': 'gold' });
  private readonly hpFill = h('div.hp-fill');
  private readonly hpText = h('span.hp-text');
  private readonly loadout = h('div.hud-loadout');
  private readonly hint = h('div.hud-hint');
  private lastLoadoutKey = '';
  private lastText = { level: '', timer: '', kills: '', gold: '', hp: '', hint: '' };

  constructor(parent: HTMLElement) {
    this.el = h(
      'div.hud',
      {},
      h('div.xp-bar', {}, this.xpFill, this.level),
      this.timer,
      h('div.hud-kills', {}, h('span', {}, '💀 '), this.kills, h('span.hud-gold', {}, '🪙 ', this.gold)),
      this.loadout,
      this.hint,
      h('div.hp-bar', {}, this.hpFill, this.hpText),
    );
    parent.append(this.el);
    this.hint.style.display = 'none';
    this.setVisible(false);
  }

  setVisible(v: boolean): void {
    this.el.style.display = v ? '' : 'none';
  }

  update(world: World): void {
    const p = world.player;
    this.xpFill.style.transform = `scaleX(${Math.min(1, world.xp / world.xpNext)})`;
    this.hpFill.style.transform = `scaleX(${Math.max(0, p.hp / p.maxHp)})`;
    this.setText('level', this.level, `Sv. ${world.level}`);
    this.setText('timer', this.timer, formatTime(world.time));
    this.setText('kills', this.kills, String(world.kills));
    this.setText('gold', this.gold, String(Math.floor(world.gold)));
    this.setText('hp', this.hpText, `${Math.ceil(p.hp)} / ${Math.round(p.maxHp)}`);

    const chest = world.nearbyChest();
    let hint = '';
    if (chest) {
      hint = chest.free
        ? '📦 Ödül sandığı · ücretsiz, üstüne yürü'
        : `📦 Sandık · ${chest.price} altın${chest.affordable ? ', üstüne yürü' : ' (altın yetmiyor)'}`;
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
      this.loadout.replaceChildren(
        h('div.loadout-row', {}, ...world.weapons.map((w) => slot(w.def.icon, w.level, w.def.name))),
        h(
          'div.loadout-row',
          {},
          ...TOMES.flatMap((t, i) =>
            world.tomeLevels[i] > 0 ? [slot(t.icon, world.tomeLevels[i], t.name)] : [],
          ),
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

  private setText(key: keyof Hud['lastText'], el: HTMLElement, text: string): void {
    if (this.lastText[key] === text) return;
    this.lastText[key] = text;
    el.textContent = text;
  }
}

function slot(icon: string, level: number, title: string): HTMLElement {
  return h('div.slot', { title }, h('span.slot-icon', {}, icon), h('span.slot-level', {}, String(level)));
}
