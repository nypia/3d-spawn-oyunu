export interface Flags {
  debug: boolean;
  /** >0 ise bu kadar düşmanla performans testi (ölümsüz). */
  bench: number;
  seed: number | null;
  quality: 'low' | 'high' | null;
}

/**
 * Hata ayıklama bayraklarını okur. İki kaynak:
 *  - query string: `?debug&seed=42&bench=1000&quality=low` (yerel geliştirme)
 *  - hash token'ları: `#debug.low.seed42.bench1000` (Artifact'ta sadece hash sayfaya ulaşır)
 */
export function readFlags(search: string, hash: string): Flags {
  const q = new URLSearchParams(search);
  const flags: Flags = {
    debug: q.has('debug'),
    bench: Number(q.get('bench') ?? 0) || 0,
    seed: q.get('seed') !== null && q.get('seed') !== '' ? Number(q.get('seed')) : null,
    quality:
      q.get('quality') === 'low' || q.get('quality') === 'high' ? (q.get('quality') as 'low' | 'high') : null,
  };
  for (const token of hash.replace(/^#/, '').split('.')) {
    if (token === 'debug') flags.debug = true;
    else if (token === 'low' || token === 'high') flags.quality = token;
    else if (token === 'bench') flags.bench = 1000;
    else if (/^bench\d+$/.test(token)) flags.bench = Number(token.slice(5));
    else if (/^seed\d+$/.test(token)) flags.seed = Number(token.slice(4));
  }
  if (flags.seed !== null && !Number.isFinite(flags.seed)) flags.seed = null;
  return flags;
}
