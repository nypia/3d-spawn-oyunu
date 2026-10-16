import type { RunSummary } from '../sim/world/RunStats';

/** Zaferle bitirilen koşunun gümüş çarpanı. */
export const VICTORY_SILVER = 1.25;

/**
 * Koşu sonunda kazanılan gümüş: süre, öldürme, seviye, boss'lar, final zaferleri ve harcanmamış altın.
 * Zaferle bitirince ×1,25; Gümüş Kesesi rank başına +%10. Hileli koşu 0.
 */
export function silverForRun(s: RunSummary, silverRank: number, cheated: boolean): number {
  if (cheated) return 0;
  const base =
    Math.floor(s.time / 20) +
    Math.floor(s.kills / 100) +
    s.level +
    15 * s.bosses.length +
    50 * s.victories +
    Math.floor(s.goldLeft / 25);
  const mul = (s.outcome === 'victory' ? VICTORY_SILVER : 1) * (1 + 0.1 * silverRank);
  return Math.round(base * mul);
}
