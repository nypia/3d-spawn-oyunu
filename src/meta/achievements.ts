import type { RunSummary } from '../sim/world/RunStats';

/** Kahraman açan başarımlar (koşu özetinden denetlenir). */
export interface AchievementDef {
  id: string;
  name: string;
  check: (s: RunSummary) => boolean;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'slimeKing', name: "Balçık Kral'ı yen", check: (s) => s.bossIndices.includes(0) },
  { id: 'vampireLord', name: "Vampir Lordu'nu yen", check: (s) => s.bossIndices.includes(1) },
  { id: 'boneKing', name: "Kemik Kral'ı yen", check: (s) => s.victories > 0 },
  { id: 'bloodMoon', name: "Kan Ayı'nı yen", check: (s) => s.victories > 1 },
];
