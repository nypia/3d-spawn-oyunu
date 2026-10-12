const GAME_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'KeyC',
  'KeyQ',
  'KeyE',
]);

/**
 * Klavye + fare girdisi. Pointer lock varsa fare hareketi kamerayı döndürür;
 * yoksa (ya da reddedilirse) sürükleyerek bakma çalışır.
 * Dokunmatik kontroller M5'te bu sınıfa eklenecek (aynı eksen arayüzü).
 */
export class Input {
  locked = false;
  onLockChange: (locked: boolean) => void = () => {};

  private readonly keys = new Set<string>();
  private readonly actions = new Map<string, () => void>();
  private lookX = 0;
  private lookY = 0;
  private jumpQueued = false;
  private dragging = false;

  constructor(private readonly el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.jumpQueued = true;
      this.actions.get(e.code)?.();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    el.addEventListener('mousedown', () => {
      this.dragging = true;
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.locked || this.dragging) {
        this.lookX += e.movementX;
        this.lookY += e.movementY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      this.dragging = false;
      this.onLockChange(this.locked);
    });
  }

  /** Tuşa basıldığında bir kez çalışacak eylem (Esc, 1-2-3, hile tuşları...). */
  onKey(code: string, fn: () => void): void {
    this.actions.set(code, fn);
  }

  requestLock(): void {
    try {
      const r = this.el.requestPointerLock() as unknown;
      if (r instanceof Promise) r.catch(() => {});
    } catch {
      // Desteklenmiyorsa sürükleyerek bakma kullanılır.
    }
  }

  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  consumeLook(): [number, number] {
    const r: [number, number] = [this.lookX, this.lookY];
    this.lookX = 0;
    this.lookY = 0;
    return r;
  }

  consumeJump(): boolean {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  /** [ileri, sağ] eksenleri, -1..1 */
  axes(): [number, number] {
    const k = this.keys;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const right =
      (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    return [fwd, right];
  }

  slideHeld(): boolean {
    const k = this.keys;
    return k.has('ShiftLeft') || k.has('ShiftRight') || k.has('ControlLeft') || k.has('KeyC');
  }

  /** Q/E ile kamera döndürme (fare kullanmayanlar için). */
  rotateAxis(): number {
    return (this.keys.has('KeyQ') ? 1 : 0) - (this.keys.has('KeyE') ? 1 : 0);
  }

  clear(): void {
    this.keys.clear();
    this.jumpQueued = false;
    this.lookX = 0;
    this.lookY = 0;
  }
}
