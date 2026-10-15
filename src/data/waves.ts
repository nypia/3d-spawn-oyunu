import { ENEMY_INDEX } from './enemies';

/**
 * Koşunun zaman çizelgesi (Vampire Survivors'taki dakika dalgaları gibi): hangi düşman ne zaman
 * katılır, hangisi emekliye ayrılır, hangi dakikada hangi temalı olay gelir. Süreler saniye;
 * Kan Ayı döngülerinde çizelge `CYCLE.timelineStart`'tan `CYCLE.pace` hızla yeniden oynar.
 */

/** Bir anahtar an: tür → seçilme ağırlığı (doğan düşmanların oranı). */
export interface WaveKey {
  at: number;
  w: Readonly<Record<string, number>>;
}

/** ring: oyuncuyu çember içine alır · swarm: tek noktadan küme · horde: bir yönden duvar. */
export type WaveEventKind = 'ring' | 'swarm' | 'horde';

export interface WaveEvent {
  at: number;
  kind: WaveEventKind;
  enemy: string;
  count: number;
  /** Çember yarıçapı (m, varsayılan BALANCE.spawn.ringRadius). */
  radius?: number;
  /** HUD duyurusu. */
  name: string;
}

export const TIMELINE: readonly WaveKey[] = [
  { at: 0, w: { slime: 10 } },
  { at: 60, w: { slime: 10, skeleton: 4 } },
  { at: 150, w: { slime: 8, skeleton: 6, bat: 4 } },
  { at: 240, w: { slime: 6, skeleton: 6, bat: 4, exploder: 2 } },
  { at: 330, w: { slime: 5, skeleton: 6, bat: 4, exploder: 3 } },
  { at: 420, w: { slime: 4, skeleton: 5, bat: 4, exploder: 3, archer: 2 } },
  { at: 510, w: { slime: 2, skeleton: 5, bat: 3, exploder: 3, archer: 3 } },
  { at: 570, w: { slime: 0, skeleton: 5, bat: 3, exploder: 3, archer: 3 } },
  { at: 750, w: { skeleton: 4, bat: 3, exploder: 3, archer: 3, golem: 2 } },
  { at: 840, w: { skeleton: 3, bat: 3, exploder: 3, archer: 3, golem: 3 } },
  { at: 960, w: { skeleton: 1, bat: 2, exploder: 3, archer: 3, golem: 4 } },
  { at: 1020, w: { skeleton: 0, bat: 2, exploder: 3, archer: 3, golem: 4 } },
  { at: 1200, w: { bat: 2, exploder: 3, archer: 4, golem: 5 } },
];

export const WAVE_EVENTS: readonly WaveEvent[] = [
  { at: 40, kind: 'ring', enemy: 'slime', count: 12, name: 'Balçık kuşatması' },
  { at: 100, kind: 'horde', enemy: 'skeleton', count: 16, name: 'İskelet akını' },
  { at: 150, kind: 'swarm', enemy: 'bat', count: 18, name: 'Yarasa sürüsü' },
  { at: 200, kind: 'ring', enemy: 'slime', count: 30, name: 'Balçık seli' },
  { at: 345, kind: 'swarm', enemy: 'exploder', count: 10, name: 'Patlayan sürüsü' },
  { at: 390, kind: 'ring', enemy: 'skeleton', count: 24, name: 'Kemik çemberi' },
  { at: 435, kind: 'ring', enemy: 'archer', count: 10, radius: 18, name: 'Okçu kuşatması' },
  { at: 570, kind: 'swarm', enemy: 'bat', count: 35, name: 'Kara bulut' },
  { at: 750, kind: 'horde', enemy: 'golem', count: 8, name: 'Golem yürüyüşü' },
  { at: 870, kind: 'swarm', enemy: 'exploder', count: 20, name: 'Barut fıçısı' },
  { at: 1005, kind: 'swarm', enemy: 'bat', count: 60, name: 'Yarasa fırtınası' },
  { at: 1050, kind: 'horde', enemy: 'golem', count: 14, name: 'Dev adımlar' },
];

/** Kan Ayı döngüsü çarpanları (döngü c için çarpan^(c−1)). */
export const CYCLE = {
  /** Bir döngünün uzunluğu (s): final boss 20. dakikada. */
  length: 1200,
  /** Kan Ayı'nda çizelge bu andan (8:00 karışımı) başlar… */
  timelineStart: 480,
  /** …ve bu kadar hızlı ilerler. */
  pace: 1.5,
  hp: 1.5,
  damage: 1.3,
  speed: 1.06,
  credit: 1.35,
  eventCount: 1.4,
  /** Döngü başında spawn'sız sakin süre (s). */
  calm: 8,
};

/** Çizelge zamanı `tl`'deki ağırlıkları `out`'a yazar (ENEMIES sırasıyla). */
export function waveWeights(tl: number, out: number[]): void {
  out.fill(0);
  let k = 0;
  while (k + 1 < TIMELINE.length && TIMELINE[k + 1].at <= tl) k++;
  const prev = TIMELINE[k];
  const next = TIMELINE[Math.min(k + 1, TIMELINE.length - 1)];
  const span = next.at - prev.at;
  const f = span > 0 ? Math.min(1, Math.max(0, (tl - prev.at) / span)) : 0;
  for (const id in prev.w) {
    const a = prev.w[id] ?? 0;
    // Yeni türler anahtarında aniden katılır; emekliye ayrılanlar doğrusal söner.
    if (a <= 0) continue;
    const b = next.w[id] ?? 0;
    const i = ENEMY_INDEX[id];
    if (i !== undefined) out[i] = a + (b - a) * f;
  }
}

/** Testler için: çizelgede geçen tüm tür kimlikleri. */
export function timelineIds(): string[] {
  const ids = new Set<string>();
  for (const k of TIMELINE) for (const id in k.w) ids.add(id);
  for (const e of WAVE_EVENTS) ids.add(e.enemy);
  return [...ids];
}
