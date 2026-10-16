import { describe, expect, it } from 'vitest';
import { HEROES } from '../../src/data/heroes';
import { META_UPGRADES } from '../../src/data/metaUpgrades';
import { MetaStore } from '../../src/meta/MetaStore';
import { LEGACY_BEST_KEY, LEGACY_HERO_KEY, META_KEY, parseMeta } from '../../src/meta/save';
import { silverForRun } from '../../src/meta/silver';
import { MemoryStorage } from '../../src/meta/storage';
import { summarizeRun } from '../../src/sim/world/RunStats';
import { World } from '../../src/sim/world/World';

function summary(over: Partial<ReturnType<typeof summarizeRun>> = {}) {
  const w = new World({ seed: 1, enemyCap: 0 });
  return { ...summarizeRun(w), ...over };
}

describe('kalıcı kayıt', () => {
  it('boş kayıt: ücretsiz kahramanlar açık, gümüş 0', () => {
    const m = parseMeta(null);
    expect(m.silver).toBe(0);
    expect(m.heroes).toEqual(HEROES.filter((h) => h.unlock.kind === 'free').map((h) => h.id));
    expect(m.heroes).toContain(m.hero);
  });

  it('bozuk/eksik veriyi düzeltir: bilinmeyen güç atılır, rank sınırlanır, kilitli seçim reddedilir', () => {
    const raw = JSON.stringify({
      v: 1,
      silver: -5,
      upgrades: { vigor: 99, hacked: 3, might: 2.7 },
      heroes: ['bora', 'nope'],
      hero: 'su',
      best: { time: 'x' },
    });
    const m = parseMeta(raw);
    expect(m.silver).toBe(0);
    expect(m.upgrades).toEqual({ vigor: 5, might: 2 });
    expect(m.heroes).toContain('bora');
    expect(m.heroes).not.toContain('nope');
    expect(m.hero).not.toBe('su');
    expect(m.best).toBeNull();
  });

  it('eski (v0.5) rekor ve kahraman seçimi içeri alınır; eskiden seçili Bora açık gelir', () => {
    const s = new MemoryStorage();
    s.setItem(LEGACY_BEST_KEY, JSON.stringify({ time: 700, cycle: 2, kills: 5000, level: 40 }));
    s.setItem(LEGACY_HERO_KEY, 'bora');
    const meta = new MetaStore(s);
    expect(meta.data.best?.time).toBe(700);
    expect(meta.isUnlocked('bora')).toBe(true);
    expect(meta.data.hero).toBe('bora');
  });
});

describe('gümüş ve dükkân', () => {
  it('gümüş formülü: süre, öldürme, seviye, boss, zafer, altın; zafer ×1,25; hile 0', () => {
    const s = summary({ time: 600, kills: 3000, level: 30, bosses: ['a', 'b'], victories: 0, goldLeft: 100 });
    // 30 + 30 + 30 + 30 + 0 + 4 = 124
    expect(silverForRun(s, 0, false)).toBe(124);
    expect(silverForRun({ ...s, outcome: 'victory', victories: 1 }, 0, false)).toBe(
      Math.round((124 + 50) * 1.25),
    );
    expect(silverForRun(s, 2, false)).toBe(Math.round(124 * 1.2));
    expect(silverForRun(s, 0, true)).toBe(0);
  });

  it('satın alma: fiyat düşülür, rank artar, en yüksekte durur; yetmezse alınmaz', () => {
    const s = new MemoryStorage();
    const meta = new MetaStore(s);
    expect(meta.buy('vigor')).toBe(false);
    meta.data.silver = 10_000;
    const def = META_UPGRADES.find((u) => u.id === 'armor');
    if (!def) throw new Error('armor yok');
    for (const c of def.costs) {
      const before = meta.silver;
      expect(meta.buy('armor')).toBe(true);
      expect(meta.silver).toBe(before - c);
    }
    expect(meta.nextCost('armor')).toBeNull();
    expect(meta.buy('armor')).toBe(false);
    // Kalıcı: yeni mağaza aynı kaydı okur.
    expect(new MetaStore(s).rank('armor')).toBe(def.costs.length);
  });

  it('Bora gümüşle, Su başarımla (Vampir Lordu) açılır', () => {
    const meta = new MetaStore(new MemoryStorage());
    expect(meta.unlockHero('bora')).toBe(false);
    meta.data.silver = 300;
    expect(meta.unlockHero('bora')).toBe(true);
    expect(meta.silver).toBe(0);
    expect(meta.unlockHero('su')).toBe(false);
    const r = meta.recordRun(summary({ bossIndices: [0, 1], bosses: ['x', 'y'], time: 650 }), false, 'ela');
    expect(r.unlocked.map((h) => h.id)).toEqual(['su']);
    expect(meta.isUnlocked('su')).toBe(true);
    expect(r.silver).toBeGreaterThan(0);
    expect(r.isNew).toBe(true);
    expect(meta.data.totals.runs).toBe(1);
  });

  it('hileli koşu gümüş, rekor ve başarım vermez', () => {
    const meta = new MetaStore(new MemoryStorage());
    const r = meta.recordRun(summary({ bossIndices: [1], time: 999 }), true, 'ela');
    expect(r.silver).toBe(0);
    expect(meta.data.best).toBeNull();
    expect(meta.isUnlocked('su')).toBe(false);
  });

  it('kayıt anahtarı yazılır', () => {
    const s = new MemoryStorage();
    const meta = new MetaStore(s);
    meta.data.silver = 100;
    meta.buy('vigor');
    expect(JSON.parse(s.getItem(META_KEY) ?? '{}').upgrades.vigor).toBe(1);
  });
});
