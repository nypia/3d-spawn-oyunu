import { HERO_BY_ID, HEROES, type HeroDef } from '../data/heroes';
import { META_UPGRADE_BY_ID } from '../data/metaUpgrades';
import type { RunLoadout } from '../sim/progression/Loadout';
import type { RunSummary } from '../sim/world/RunStats';
import { ACHIEVEMENTS } from './achievements';
import { LEGACY_BEST_KEY, LEGACY_HERO_KEY, META_KEY, type MetaSave, parseMeta, type RunRecord } from './save';
import { silverForRun } from './silver';
import { MemoryStorage, type StorageLike, safeStorage } from './storage';

export interface RunResult {
  silver: number;
  best: RunRecord | null;
  isNew: boolean;
  /** Bu koşuyla açılan kahramanlar. */
  unlocked: HeroDef[];
}

/**
 * Kalıcı ilerleme: gümüş, kalıcı güçler, kahramanlar, başarımlar ve rekor. Depolama yoksa bellekte
 * tutar (`persistent` false: arayüz uyarır).
 */
export class MetaStore {
  data: MetaSave;
  readonly persistent: boolean;
  private readonly storage: StorageLike;

  constructor(storage: StorageLike | null = safeStorage()) {
    this.persistent = storage !== null;
    this.storage = storage ?? new MemoryStorage();
    this.data = parseMeta(this.storage.getItem(META_KEY), {
      best: this.storage.getItem(LEGACY_BEST_KEY),
      hero: this.storage.getItem(LEGACY_HERO_KEY),
    });
  }

  private save(): void {
    try {
      this.storage.setItem(META_KEY, JSON.stringify(this.data));
    } catch {
      // Kota dolu ya da depolama kapandı: bu oturumda bellekte kalır.
    }
  }

  get silver(): number {
    return this.data.silver;
  }

  rank(id: string): number {
    return this.data.upgrades[id] ?? 0;
  }

  /** Sıradaki rank'in fiyatı (en yüksekteyse null). */
  nextCost(id: string): number | null {
    const def = META_UPGRADE_BY_ID[id];
    if (!def) return null;
    return def.costs[this.rank(id)] ?? null;
  }

  buy(id: string): boolean {
    const cost = this.nextCost(id);
    if (cost === null || cost > this.data.silver) return false;
    this.data.silver -= cost;
    this.data.upgrades[id] = this.rank(id) + 1;
    this.save();
    return true;
  }

  isUnlocked(heroId: string): boolean {
    return this.data.heroes.includes(heroId);
  }

  /** Gümüşle açılan kahraman. */
  unlockHero(heroId: string): boolean {
    const h = HERO_BY_ID[heroId];
    if (!h || this.isUnlocked(heroId) || h.unlock.kind !== 'silver') return false;
    if (this.data.silver < h.unlock.cost) return false;
    this.data.silver -= h.unlock.cost;
    this.data.heroes.push(heroId);
    this.save();
    return true;
  }

  /** Seçili kahraman (kilitliyse yalnızca önizleme: kaydedilmez). */
  selectHero(heroId: string): void {
    if (!this.isUnlocked(heroId)) return;
    this.data.hero = heroId;
    this.save();
  }

  /** Yeni koşunun donanımı. */
  loadout(heroId = this.data.hero): RunLoadout {
    return { hero: this.isUnlocked(heroId) ? heroId : this.data.hero, upgrades: { ...this.data.upgrades } };
  }

  /** Şimdi bitirilse kazanılacak gümüş (zafer ekranı). */
  previewSilver(s: RunSummary, cheated: boolean): number {
    return silverForRun(s, this.rank('silverGain'), cheated);
  }

  /**
   * Koşu bitti: gümüş eklenir, başarımlar ve açılan kahramanlar denetlenir, rekor güncellenir.
   * Hileli koşu hiçbir şey kazandırmaz.
   */
  recordRun(s: RunSummary, cheated: boolean, hero: string): RunResult {
    const silver = silverForRun(s, this.rank('silverGain'), cheated);
    const d = this.data;
    if (cheated) return { silver: 0, best: d.best, isNew: false, unlocked: [] };
    d.silver += silver;
    d.lifetimeSilver += silver;
    d.totals.runs++;
    d.totals.victories += s.victories;
    d.totals.kills += s.kills;
    d.totals.time += s.time;
    d.totals.bossKills += s.bosses.length;
    for (const a of ACHIEVEMENTS) if (!d.achievements.includes(a.id) && a.check(s)) d.achievements.push(a.id);
    const unlocked: HeroDef[] = [];
    for (const h of HEROES) {
      if (
        h.unlock.kind === 'achievement' &&
        !d.heroes.includes(h.id) &&
        d.achievements.includes(h.unlock.id)
      ) {
        d.heroes.push(h.id);
        unlocked.push(h);
      }
    }
    const run: RunRecord = {
      time: s.time,
      cycle: s.outcome === 'victory' ? Math.max(1, s.cycle - 1) : s.cycle,
      kills: s.kills,
      level: s.level,
      victory: s.victories > 0,
      hero,
    };
    const isNew = !d.best || run.time > d.best.time;
    if (isNew) d.best = run;
    this.save();
    return { silver, best: d.best, isNew, unlocked };
  }
}
