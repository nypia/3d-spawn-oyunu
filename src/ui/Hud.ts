import { TOMES } from '../data/tomes';
import type { World } from '../sim/world/World';
import { formatTime, h } from './dom';

/** Oyun içi gösterge: XP barı, seviye, süre, kill, can barı, silah/kitap ikonları. */
export class Hud {
  readonly el: HTMLDivElement;
  private readonly xpFill = h('div.xp-fill');
  private readonly level = h('span.xp-level');
  private readonly timer = h('div.hud-timer');
  private readonly kills = h('div.hud-kills');
  private readonly hpFill = h('div.hp-fill');
  private readonly hpText = h('span.hp-text');
  private readonly loadout = h('div.hud-loadout');
  private lastLoadoutKey = '';
  private lastText = { level: '', timer: '', kills: '', hp: '' };

  constructor(parent: HTMLElement) {
    this.el = h(
      'div.hud',
      {},
      h('div.xp-bar', {}, this.xpFill, this.level),
      this.timer,
      this.kills,
      this.loadout,
      h('div.hp-bar', {}, this.hpFill, this.hpText),
    );
    parent.append(this.el);
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
    this.setText('kills', this.kills, `💀 ${world.kills}`);
    this.setText('hp', this.hpText, `${Math.ceil(p.hp)} / ${Math.round(p.maxHp)}`);

    const key = world.weapons.map((w) => `${w.def.id}${w.level}`).join() + world.tomeLevels.join();
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
