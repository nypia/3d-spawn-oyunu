export const STAT_KEYS = [
  'maxHp',
  'regen',
  'armor',
  'moveSpeed',
  'jumpCount',
  'damage',
  'attackSpeed',
  'projectileCount',
  'area',
  'duration',
  'projectileSpeed',
  'critChance',
  'critDamage',
  'pickupRange',
  'xpGain',
  'luck',
  'knockback',
  'goldGain',
  /** Lanet: spawn yoğunluğunu artırır (1 + curse çarpanı). */
  'curse',
  /** Kayma gücü: kayma hızı çarpanı. */
  'slidePower',
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

export type StatBlock = Record<StatKey, number>;

/**
 * Taban değer + modifier yığını.
 *   değer = (taban + Σadd) × (1 + Σmult)
 * "Çarpan" türündeki stat'lar (damage, area, attackSpeed...) taban olarak 1 tutulur;
 * böylece "+%15 hasar" = mult +0.15 olur.
 */
export class Stats {
  private readonly base: StatBlock;
  private readonly add: StatBlock;
  private readonly mult: StatBlock;

  constructor(base: Partial<StatBlock> = {}) {
    this.base = { ...DEFAULT_BASE, ...base };
    this.add = zeroBlock();
    this.mult = zeroBlock();
  }

  get(key: StatKey): number {
    return (this.base[key] + this.add[key]) * (1 + this.mult[key]);
  }

  addFlat(key: StatKey, amount: number): void {
    this.add[key] += amount;
  }

  addMult(key: StatKey, amount: number): void {
    this.mult[key] += amount;
  }
}

export const DEFAULT_BASE: StatBlock = {
  maxHp: 100,
  regen: 0,
  armor: 0,
  moveSpeed: 7,
  jumpCount: 1,
  damage: 1,
  attackSpeed: 1,
  projectileCount: 0,
  area: 1,
  duration: 1,
  projectileSpeed: 1,
  critChance: 0.05,
  critDamage: 1.5,
  pickupRange: 3.2,
  xpGain: 1,
  luck: 0,
  knockback: 1,
  goldGain: 1,
  curse: 0,
  slidePower: 1,
};

function zeroBlock(): StatBlock {
  const b = {} as StatBlock;
  for (const k of STAT_KEYS) b[k] = 0;
  return b;
}
