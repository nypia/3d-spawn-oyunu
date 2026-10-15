/**
 * Ses efektleri: dosyalar src/assets/audio/sfx/<kimlik>.mp3 (scripts/fetch-audio.mjs üretir).
 *  vol: taban ses · max: aynı anda en fazla kaç kopya · gap: iki başlatma arası en az (s) ·
 *  bus: efekt ya da arayüz kanalı · cut: bu kadar saniye sonra yumuşakça kes.
 */
export interface SoundDef {
  vol: number;
  max: number;
  gap: number;
  bus: 'sfx' | 'ui';
  cut?: number;
}

const sfx = (vol: number, max = 3, gap = 0.03, cut?: number): SoundDef => ({
  vol,
  max,
  gap,
  bus: 'sfx',
  cut,
});
const ui = (vol: number, max = 2, gap = 0.03, cut?: number): SoundDef => ({ vol, max, gap, bus: 'ui', cut });

export const SOUNDS = {
  // Arayüz
  click: ui(0.45),
  select: ui(0.6),
  back: ui(0.5),
  reroll: ui(0.55, 1, 0.2, 0.7),
  banish: ui(0.6),
  tick: ui(0.35, 3, 0.03),
  bong: ui(0.55, 1, 0.3),
  creak: ui(0.6, 1, 0.3),
  latch: ui(0.6, 1, 0.2),
  revealCommon: ui(0.7, 1, 0.2),
  revealRare: ui(0.7, 1, 0.2),
  revealEpic: ui(0.8, 1, 0.2),
  revealLegend: ui(0.9, 1, 0.2),
  levelUp: ui(0.6, 1, 0.3),
  gameOver: ui(0.75, 1, 1),
  bossDead: ui(0.8, 1, 1),
  goblinCaught: ui(0.7, 1, 1),
  // Dövüş
  hit1: sfx(0.22, 4, 0.03),
  hit2: sfx(0.22, 4, 0.03),
  crit: sfx(0.32, 2, 0.06),
  deathSoft: sfx(0.32, 4, 0.04),
  deathBone: sfx(0.36, 4, 0.04),
  deathHeavy: sfx(0.36, 3, 0.05),
  explosion: sfx(0.42, 3, 0.08),
  boom: sfx(0.7, 2, 0.2),
  hurt: sfx(0.45, 1, 0.15),
  // Silahlar ve düşman atışları
  bolt: sfx(0.12, 2, 0.08),
  axe: sfx(0.22, 2, 0.1),
  pellet: sfx(0.2, 2, 0.1),
  swing: sfx(0.28, 2, 0.1),
  zap: sfx(0.2, 2, 0.1),
  arrow: sfx(0.24, 2, 0.1),
  orb: sfx(0.28, 2, 0.12),
  // Toplama ve güçler
  gem: sfx(0.2, 4, 0.025),
  coin: sfx(0.28, 3, 0.04),
  coins: sfx(0.5, 1, 0.3),
  heal: sfx(0.5, 1, 0.1),
  magnet: sfx(0.5, 1, 0.3),
  freeze: sfx(0.5, 1, 0.3),
  bell: sfx(0.6, 2, 0.3),
  vase: sfx(0.42, 2, 0.06),
  wood: sfx(0.42, 2, 0.06),
  // Oyuncu
  jump: sfx(0.22, 1, 0.08),
  land: sfx(0.36, 1, 0.1),
  step1: sfx(0.16, 1, 0.12),
  step2: sfx(0.16, 1, 0.12),
  slide: sfx(0.36, 1, 0.2),
  // Olaylar
  slime: sfx(0.6, 1, 0.3),
  force: sfx(0.6, 1, 0.3),
  spikes: sfx(0.45, 3, 0.05),
} satisfies Record<string, SoundDef>;

export type SoundId = keyof typeof SOUNDS;

/** Müzik parçaları: src/assets/audio/music/<parça>.mp3. */
export const MUSIC_TRACKS = ['menu', 'day', 'blood', 'boss'] as const;
export type MusicTrack = (typeof MUSIC_TRACKS)[number];
