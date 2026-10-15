import { describe, expect, it } from 'vitest';
import { ENEMIES, ENEMY_INDEX } from '../../src/data/enemies';
import { CYCLE, TIMELINE, timelineIds, WAVE_EVENTS, waveWeights } from '../../src/data/waves';

describe('zaman çizelgesi', () => {
  it('anahtarlar ve olaylar zamana göre sıralı, 20 dakikayı kapsıyor', () => {
    for (let k = 1; k < TIMELINE.length; k++) expect(TIMELINE[k].at).toBeGreaterThan(TIMELINE[k - 1].at);
    for (let k = 1; k < WAVE_EVENTS.length; k++) {
      expect(WAVE_EVENTS[k].at).toBeGreaterThanOrEqual(WAVE_EVENTS[k - 1].at);
    }
    expect(TIMELINE[0].at).toBe(0);
    expect(TIMELINE[TIMELINE.length - 1].at).toBe(CYCLE.length);
  });

  it('geçen her tür tanımlı ve sıradan', () => {
    for (const id of timelineIds()) {
      expect(ENEMY_INDEX[id], id).toBeDefined();
      expect(ENEMIES[ENEMY_INDEX[id]].role).toBe('regular');
    }
  });

  it('başta yalnızca balçık, sonra türler katılır ve emekliye ayrılır', () => {
    const w = ENEMIES.map(() => 0);
    waveWeights(0, w);
    expect(w.filter((v) => v > 0)).toHaveLength(1);
    expect(w[ENEMY_INDEX.slime]).toBeGreaterThan(0);

    waveWeights(CYCLE.length, w);
    expect(w[ENEMY_INDEX.slime]).toBe(0);
    expect(w.filter((v) => v > 0).length).toBeGreaterThanOrEqual(4);

    // Çizelgedeki her tür bir anda ağırlık kazanır.
    const seen = new Set<number>();
    for (let t = 0; t <= CYCLE.length; t += 5) {
      waveWeights(t, w);
      for (let i = 0; i < w.length; i++) if (w[i] > 0) seen.add(i);
    }
    for (const k of TIMELINE)
      for (const id in k.w) if (k.w[id] > 0) expect(seen.has(ENEMY_INDEX[id]), id).toBe(true);
  });
});
