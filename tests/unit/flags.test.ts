import { describe, expect, it } from 'vitest';
import { readFlags } from '../../src/core/flags';

describe('readFlags', () => {
  it('query string okur', () => {
    expect(readFlags('?debug&seed=42&bench=500&quality=low', '')).toEqual({
      debug: true,
      bench: 500,
      seed: 42,
      quality: 'low',
    });
  });

  it('hash token larını okur (Artifact)', () => {
    expect(readFlags('', '#debug.high.seed7.bench')).toEqual({
      debug: true,
      bench: 1000,
      seed: 7,
      quality: 'high',
    });
  });

  it('boşken varsayılanlar', () => {
    expect(readFlags('', '')).toEqual({ debug: false, bench: 0, seed: null, quality: null });
  });
});
