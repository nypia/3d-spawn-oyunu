import { BALANCE } from '../data/balance';

export interface QualitySettings {
  name: 'low' | 'high';
  antialias: boolean;
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  enemyCap: number;
}

export const QUALITY_HIGH: QualitySettings = {
  name: 'high',
  antialias: true,
  maxPixelRatio: 2,
  shadows: true,
  shadowMapSize: 2048,
  enemyCap: BALANCE.spawn.capDesktop,
};

export const QUALITY_LOW: QualitySettings = {
  name: 'low',
  antialias: false,
  maxPixelRatio: 1.25,
  shadows: false,
  shadowMapSize: 512,
  enemyCap: BALANCE.spawn.capMobile,
};

export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
}

/** Varsayılan kalite: dokunmatik cihazda düşük, aksi halde yüksek. `?quality=low|high` ile zorlanabilir. */
export function detectQuality(params: URLSearchParams): QualitySettings {
  const q = params.get('quality');
  if (q === 'low') return QUALITY_LOW;
  if (q === 'high') return QUALITY_HIGH;
  return isTouchDevice() ? QUALITY_LOW : QUALITY_HIGH;
}
