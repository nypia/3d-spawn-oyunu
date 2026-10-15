/// <reference types="node" />
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MUSIC_TRACKS, SOUNDS } from '../../src/audio/sounds';
import { VoiceLimiter } from '../../src/audio/VoiceLimiter';

describe('ses sınırlayıcı', () => {
  it('aynı sesin kopya sayısını ve başlatma aralığını sınırlar', () => {
    const l = new VoiceLimiter(24);
    expect(l.tryStart('hit', 0, 2, 0.03)).toBe(true);
    // 30 ms dolmadan aynı ses yok.
    expect(l.tryStart('hit', 0.01, 2, 0.03)).toBe(false);
    expect(l.tryStart('hit', 0.04, 2, 0.03)).toBe(true);
    // İki kopya çalıyor: üçüncüsü yok.
    expect(l.tryStart('hit', 0.1, 2, 0.03)).toBe(false);
    l.end('hit');
    expect(l.tryStart('hit', 0.11, 2, 0.03)).toBe(true);
    expect(l.playing('hit')).toBe(2);
    // Başka ses bağımsız.
    expect(l.tryStart('coin', 0.11, 2, 0.03)).toBe(true);
  });

  it('toplam ses sınırı ve fazla end çağrıları güvenli', () => {
    const l = new VoiceLimiter(3);
    expect(l.tryStart('a', 0, 5, 0)).toBe(true);
    expect(l.tryStart('b', 0, 5, 0)).toBe(true);
    expect(l.tryStart('c', 0, 5, 0)).toBe(true);
    expect(l.tryStart('d', 0, 5, 0)).toBe(false);
    l.end('a');
    l.end('a');
    l.end('zz');
    expect(l.total).toBe(2);
    expect(l.tryStart('d', 1, 5, 0)).toBe(true);
  });
});

describe('ses dosyaları', () => {
  it('her efektin dosyası var, fazladan dosya yok', () => {
    const files = readdirSync('src/assets/audio/sfx').map((f) => f.replace(/\.mp3$/, ''));
    expect(files.sort()).toEqual(Object.keys(SOUNDS).sort());
    for (const def of Object.values(SOUNDS)) {
      expect(def.vol).toBeGreaterThan(0);
      expect(def.vol).toBeLessThanOrEqual(1);
      expect(def.max).toBeGreaterThanOrEqual(1);
    }
  });

  it('dört müzik parçası var', () => {
    const files = readdirSync('src/assets/audio/music').map((f) => f.replace(/\.mp3$/, ''));
    expect(files.sort()).toEqual([...MUSIC_TRACKS].sort());
  });
});
