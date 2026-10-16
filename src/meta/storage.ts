/** localStorage benzeri en küçük arayüz (testlerde bellek içi sahte kullanılır). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Kullanılabilir depolama ya da null (gizli pencere, kapalı çerezler, bazı iframe'ler): ilerleme o
 * zaman yalnızca bu oturumda tutulur.
 */
export function safeStorage(): StorageLike | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const k = 'spawn-oyunu.probe';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

/** Bellek içi depolama (testler ve depolamasız ortam). */
export class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}
