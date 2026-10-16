import { MUSIC_TRACKS, type MusicTrack, SOUNDS, type SoundId } from './sounds';
import { VoiceLimiter } from './VoiceLimiter';

/**
 * Ses dosyaları derlemeye gömülür (`?url&inline`): Artifact tek dosya kalır. Efektler ilk etkileşimde
 * AudioBuffer'a çözülür; müzik çözülmeden <audio> öğesiyle akar (bellek dostu).
 */
const SFX_URLS = import.meta.glob<string>('../assets/audio/sfx/*.mp3', {
  query: '?url&inline',
  import: 'default',
  eager: true,
});
const MUSIC_URLS = import.meta.glob<string>('../assets/audio/music/*.mp3', {
  query: '?url&inline',
  import: 'default',
  eager: true,
});

/** Tarayıcının reddettiği oynat/askıya al sözleri: bir sonraki etkileşimde yeniden denenir. */
const ignore = () => undefined;

const fileId = (path: string) => path.replace(/^.*\//, '').replace(/\.mp3$/, '');

export interface AudioSettings {
  sfx: number;
  music: number;
  muted: boolean;
}

export interface PlayOptions {
  vol?: number;
  rate?: number;
  /** Dünyadaki konum: oyuncuya uzaklıkla kısılır, kameraya göre sağa/sola kayar. */
  x?: number;
  z?: number;
}

const SETTINGS_KEY = 'spawn-oyunu.audio';
const FADE = 1.5;
/** Bu uzaklıktan sonra konumlu sesler duyulmaz (m). */
const HEAR_RANGE = 55;

async function toArrayBuffer(uri: string): Promise<ArrayBuffer> {
  if (!uri.startsWith('data:')) return (await fetch(uri)).arrayBuffer();
  const bin = atob(uri.slice(uri.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<AudioSettings>;
      return {
        sfx: typeof s.sfx === 'number' ? s.sfx : 0.8,
        music: typeof s.music === 'number' ? s.music : 0.5,
        muted: s.muted === true,
      };
    }
  } catch {
    // Depolama kapalı: varsayılanlar.
  }
  return { sfx: 0.8, music: 0.5, muted: false };
}

interface MusicVoice {
  track: MusicTrack;
  el: HTMLAudioElement;
  gain: GainNode;
}

/**
 * Tek AudioContext: ana → efekt / arayüz / müzik kanalları. İlk dokunuş, tuş ya da OYNA ile açılır
 * (tarayıcıların otomatik oynatma kuralı). Desteklenmeyen ortamda sessizce devre dışı kalır.
 */
export class AudioManager {
  ctx: AudioContext | null = null;
  readonly settings: AudioSettings = loadSettings();
  /** Başlatılan efekt sayısı (tanı ve testler). */
  played = 0;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private uiBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly limiter = new VoiceLimiter(24);
  private readonly voices = new Map<MusicTrack, MusicVoice>();
  private current: MusicVoice | null = null;
  private wanted: MusicTrack | null = null;
  private paused = false;
  private hidden = false;
  private lx = 0;
  private lz = 0;
  private lyaw = Math.PI;

  /** Kullanıcı etkileşiminde çağrılır (birden çok kez çağrılabilir). */
  unlock(): void {
    if (!this.ctx) this.create();
    if (this.hidden) return;
    this.resumeContext();
    // iOS: <audio> öğeleri ilk kez bir etkileşim içinde oynatılınca sonradan da çalabilir. İşaret ancak
    // oynatma başarılı olunca konur; reddedilirse bir sonraki etkileşimde yeniden denenir.
    for (const { el } of this.voices.values()) {
      if (el.dataset.primed || el.dataset.priming) continue;
      el.dataset.priming = '1';
      el.muted = true;
      void el
        .play()
        .then(() => {
          el.dataset.primed = '1';
          if (this.current?.el !== el) el.pause();
        })
        .catch(() => {
          // izin yok: sonraki etkileşimde tekrar
        })
        .finally(() => {
          el.muted = false;
          delete el.dataset.priming;
        });
    }
    this.syncMusic();
  }

  /** Askıdaki (ya da iOS'ta telefon/çağrı ile "interrupted") bağlamı sürdürür. */
  private resumeContext(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
    void ctx
      .resume()
      .then(() => this.syncMusic())
      .catch(() => {
        // sonraki etkileşimde tekrar denenir
      });
  }

  /** Sekme gizlenince ses tamamen durur (döngü de durduğu için müzik başka türlü kısılmaz). */
  setHidden(hidden: boolean): void {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    const ctx = this.ctx;
    if (!ctx) return;
    if (hidden) {
      this.current?.el.pause();
      if (ctx.state === 'running') void ctx.suspend().catch(ignore);
      return;
    }
    const cur = this.current;
    void ctx
      .resume()
      .then(() => {
        if (cur && this.current === cur) void cur.el.play().catch(ignore);
        this.syncMusic();
      })
      .catch(ignore);
  }

  private create(): void {
    const Ctor =
      typeof AudioContext !== 'undefined'
        ? AudioContext
        : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      return;
    }
    this.ctx = ctx;
    ctx.onstatechange = () => this.syncMusic();
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.uiBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.uiBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.applyVolumes();
    for (const [path, url] of Object.entries(SFX_URLS)) {
      const id = fileId(path);
      void toArrayBuffer(url)
        .then((ab) => ctx.decodeAudioData(ab))
        .then((buf) => this.buffers.set(id, buf))
        .catch(() => {
          // Çözülemeyen ses atlanır.
        });
    }
    // Her parça: <audio> → kaynak → kendi kazancı (çapraz geçiş) → müzik kanalı.
    for (const track of MUSIC_TRACKS) {
      const url = Object.entries(MUSIC_URLS).find(([p]) => fileId(p) === track)?.[1];
      if (!url) continue;
      const el = new Audio(url);
      el.loop = true;
      el.preload = 'auto';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      try {
        ctx.createMediaElementSource(el).connect(gain);
      } catch {
        continue;
      }
      gain.connect(this.musicBus);
      this.voices.set(track, { track, el, gain });
    }
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  setListener(x: number, z: number, yaw: number): void {
    this.lx = x;
    this.lz = z;
    this.lyaw = yaw;
  }

  play(id: SoundId, o: PlayOptions = {}): void {
    const ctx = this.ctx;
    if (ctx?.state !== 'running' || this.settings.muted) return;
    const buf = this.buffers.get(id);
    if (!buf) return;
    const def = SOUNDS[id];
    let vol = def.vol * (o.vol ?? 1);
    let pan = 0;
    if (o.x !== undefined && o.z !== undefined) {
      const dx = o.x - this.lx;
      const dz = o.z - this.lz;
      const d = Math.hypot(dx, dz);
      if (d > HEAR_RANGE) return;
      vol *= 1 / (1 + Math.max(0, d - 5) / 12);
      // Kameranın sağ ekseni (cos, −sin) üzerindeki pay.
      if (d > 0.5)
        pan = Math.max(
          -0.75,
          Math.min(0.75, ((dx * Math.cos(this.lyaw) - dz * Math.sin(this.lyaw)) / d) * 0.75),
        );
    }
    if (vol < 0.01) return;
    const now = ctx.currentTime;
    if (!this.limiter.tryStart(id, now, def.max, def.gap)) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate ?? 1;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    let node: AudioNode = src.connect(gain);
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node = node.connect(p);
    }
    node.connect(def.bus === 'ui' ? (this.uiBus as GainNode) : (this.sfxBus as GainNode));
    src.onended = () => this.limiter.end(id);
    src.start(now);
    if (def.cut) {
      gain.gain.setValueAtTime(vol, now + def.cut * 0.7);
      gain.gain.linearRampToValueAtTime(0, now + def.cut);
      src.stop(now + def.cut + 0.02);
    }
    this.played++;
  }

  /** Çalması istenen müzik (null = sessizlik); değişince 1,5 sn çapraz geçiş. */
  setMusic(track: MusicTrack | null): void {
    if (track === this.wanted) return;
    this.wanted = track;
    this.syncMusic();
  }

  /** Duraklatma ekranında müzik kısılır. */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.applyVolumes();
  }

  /** Efsanevi açılışta müziği kısa süre kıs. */
  duck(seconds: number): void {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus) return;
    const now = ctx.currentTime;
    const base = this.musicLevel();
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(bus.gain.value, now);
    bus.gain.linearRampToValueAtTime(base * 0.25, now + 0.08);
    bus.gain.setValueAtTime(base * 0.25, now + seconds);
    bus.gain.linearRampToValueAtTime(base, now + seconds + 0.8);
  }

  private syncMusic(): void {
    const ctx = this.ctx;
    if (ctx?.state !== 'running' || this.hidden) return;
    const want = this.wanted;
    if (this.current?.track === want) return;
    const now = ctx.currentTime;
    const old = this.current;
    if (old) {
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + FADE);
      setTimeout(
        () => {
          if (this.current !== old) old.el.pause();
        },
        FADE * 1000 + 100,
      );
    }
    const next = want ? this.voices.get(want) : undefined;
    this.current = next ?? null;
    if (!next) return;
    next.gain.gain.cancelScheduledValues(now);
    next.gain.gain.setValueAtTime(0, now);
    next.gain.gain.linearRampToValueAtTime(1, now + FADE);
    next.el.currentTime = 0;
    void next.el.play().catch(() => {
      // Tarayıcı izin vermedi: bir sonraki etkileşimde yeniden denenir.
      if (this.current === next) this.current = null;
    });
  }

  private musicLevel(): number {
    return (this.settings.muted ? 0 : this.settings.music) * (this.paused ? 0.45 : 1);
  }

  private applyVolumes(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.uiBus || !this.musicBus) return;
    const m = this.settings.muted ? 0 : 1;
    const now = ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx * m, now, 0.02);
    this.uiBus.gain.setTargetAtTime(Math.min(1, this.settings.sfx * 1.1) * m, now, 0.02);
    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.setTargetAtTime(this.musicLevel(), now, 0.05);
  }

  setVolume(kind: 'sfx' | 'music', v: number): void {
    this.settings[kind] = Math.max(0, Math.min(1, v));
    this.applyVolumes();
    this.save();
  }

  toggleMute(): boolean {
    this.settings.muted = !this.settings.muted;
    this.applyVolumes();
    this.save();
    return this.settings.muted;
  }

  private save(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // Depolama kapalı: ayarlar bu oturumla sınırlı.
    }
  }
}
