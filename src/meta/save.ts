import { HERO_BY_ID, HEROES } from '../data/heroes';
import { META_UPGRADE_BY_ID } from '../data/metaUpgrades';

/** En iyi koşu (ölçüt: süre). */
export interface RunRecord {
  time: number;
  cycle: number;
  kills: number;
  level: number;
  victory?: boolean;
  hero?: string;
}

export interface MetaTotals {
  runs: number;
  victories: number;
  kills: number;
  time: number;
  bossKills: number;
}

/** Kalıcı ilerleme (sürümlü JSON). */
export interface MetaSave {
  v: 1;
  silver: number;
  lifetimeSilver: number;
  /** Güç kimliği → rank. */
  upgrades: Record<string, number>;
  /** Açılmış kahramanlar ve seçili kahraman. */
  heroes: string[];
  hero: string;
  achievements: string[];
  best: RunRecord | null;
  totals: MetaTotals;
}

export const META_KEY = 'spawn-oyunu.meta';
/** Eski (v0.5) anahtarlar: ilk açılışta içeri alınır. */
export const LEGACY_BEST_KEY = 'spawn-oyunu.best';
export const LEGACY_HERO_KEY = 'spawn.hero';

const freeHeroes = () => HEROES.filter((h) => h.unlock.kind === 'free').map((h) => h.id);

export function defaultMeta(): MetaSave {
  return {
    v: 1,
    silver: 0,
    lifetimeSilver: 0,
    upgrades: {},
    heroes: freeHeroes(),
    hero: HEROES[0].id,
    achievements: [],
    best: null,
    totals: { runs: 0, victories: 0, kills: 0, time: 0, bossKills: 0 },
  };
}

const num = (v: unknown, min = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, v) : min;

function parseRecord(v: unknown): RunRecord | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Partial<RunRecord>;
  if (typeof r.time !== 'number' || !Number.isFinite(r.time)) return null;
  return {
    time: r.time,
    cycle: num(r.cycle, 1),
    kills: num(r.kills),
    level: num(r.level, 1),
    victory: r.victory === true,
    hero: typeof r.hero === 'string' ? r.hero : undefined,
  };
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Kaydı okur ve doğrular: bilinmeyen güçler atılır, rank'ler sınırlanır, ücretsiz kahramanlar hep
 * açıktır. Kayıt yoksa eski rekor ve kahraman seçimi alınır (eski seçim Bora ya da Su ise açık gelir).
 */
export function parseMeta(
  raw: string | null,
  legacy: { best?: string | null; hero?: string | null } = {},
): MetaSave {
  const m = defaultMeta();
  const data = parseJson(raw) as Partial<MetaSave> | null;
  if (!data || typeof data !== 'object') {
    m.best = parseRecord(parseJson(legacy.best ?? null));
    const old = legacy.hero;
    if (old && HERO_BY_ID[old]) {
      m.hero = old;
      if (!m.heroes.includes(old)) m.heroes.push(old);
    }
    return m;
  }
  m.silver = Math.floor(num(data.silver));
  m.lifetimeSilver = Math.floor(num(data.lifetimeSilver));
  if (data.upgrades && typeof data.upgrades === 'object') {
    for (const [id, rank] of Object.entries(data.upgrades)) {
      const def = META_UPGRADE_BY_ID[id];
      if (def) m.upgrades[id] = Math.min(def.costs.length, Math.floor(num(rank)));
    }
  }
  if (Array.isArray(data.heroes))
    for (const id of data.heroes) if (HERO_BY_ID[id] && !m.heroes.includes(id)) m.heroes.push(id);
  if (typeof data.hero === 'string' && m.heroes.includes(data.hero)) m.hero = data.hero;
  if (Array.isArray(data.achievements))
    m.achievements = data.achievements.filter((a) => typeof a === 'string');
  m.best = parseRecord(data.best);
  const t = data.totals;
  if (t && typeof t === 'object') {
    m.totals = {
      runs: num(t.runs),
      victories: num(t.victories),
      kills: num(t.kills),
      time: num(t.time),
      bossKills: num(t.bossKills),
    };
  }
  return m;
}
