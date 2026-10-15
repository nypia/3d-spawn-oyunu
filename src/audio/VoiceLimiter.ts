/**
 * Ses sınırlayıcı: aynı sesin aynı anda en fazla `max` kopyası, iki başlatma arasında en az `gap`
 * saniye ve toplamda en fazla `maxTotal` ses. Kalabalık anlarında yüzlerce vuruş sesi üst üste
 * binip kulağı (ve işlemciyi) yormasın. Saatten bağımsız: zaman dışarıdan verilir (test edilebilir).
 */
export class VoiceLimiter {
  total = 0;
  private readonly active = new Map<string, number>();
  private readonly last = new Map<string, number>();

  constructor(readonly maxTotal = 24) {}

  tryStart(id: string, now: number, max: number, gap: number): boolean {
    if (this.total >= this.maxTotal) return false;
    if ((this.active.get(id) ?? 0) >= max) return false;
    const prev = this.last.get(id);
    if (prev !== undefined && now - prev < gap) return false;
    this.active.set(id, (this.active.get(id) ?? 0) + 1);
    this.last.set(id, now);
    this.total++;
    return true;
  }

  end(id: string): void {
    const n = this.active.get(id) ?? 0;
    if (n <= 0) return;
    this.active.set(id, n - 1);
    this.total = Math.max(0, this.total - 1);
  }

  playing(id: string): number {
    return this.active.get(id) ?? 0;
  }
}
