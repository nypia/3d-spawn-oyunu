import type { World } from '../sim/world/World';

/** En iyi koşu (tarayıcıda saklanır; erişilemezse sessizce yok sayılır). */
export interface RunRecord {
  time: number;
  cycle: number;
  kills: number;
  level: number;
}

const KEY = 'spawn-oyunu.best';

export function loadBest(): RunRecord | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Partial<RunRecord>;
    if (typeof r.time !== 'number') return null;
    return { time: r.time, cycle: r.cycle ?? 1, kills: r.kills ?? 0, level: r.level ?? 1 };
  } catch {
    return null;
  }
}

/** Koşuyu rekorla karşılaştırır (süre ölçüt); yeni rekorsa kaydeder. */
export function submitRun(world: World): { best: RunRecord; isNew: boolean } {
  const run: RunRecord = { time: world.time, cycle: world.cycle, kills: world.kills, level: world.level };
  const prev = loadBest();
  const isNew = !prev || run.time > prev.time;
  if (isNew) {
    try {
      localStorage.setItem(KEY, JSON.stringify(run));
    } catch {
      // Gizli sekme / depolama kapalı: rekor yalnızca bu oturumda gösterilir.
    }
  }
  return { best: isNew ? run : (prev as RunRecord), isNew };
}
