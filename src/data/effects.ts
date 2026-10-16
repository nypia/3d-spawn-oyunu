import type { StatKey } from '../sim/stats/Stats';

/**
 * Koşu başında uygulanan kalıcı etkiler (kahraman pasifleri ve dükkân güçleri ortak dili):
 * stat artışı (düz ya da yüzde), seviye atlama hakkı ya da başlangıç altını.
 */
export type LoadoutEffect =
  | { stat: StatKey; mode: 'flat' | 'mult'; value: number }
  | { charge: 'rerolls' | 'banishes' | 'skips'; value: number }
  | { gold: number };
