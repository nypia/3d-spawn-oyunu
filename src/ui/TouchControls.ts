import { h } from './dom';

const STICK_RADIUS = 60;
const DEAD_ZONE = 0.12;

/**
 * Joystick parmak ofsetini (ekran pikseli; y aşağı) [ileri, sağ] eksenlerine çevirir.
 * Ölü bölgenin içi 0, dışı 0..1 arasına yeniden ölçeklenir.
 */
export function joystickAxes(
  dx: number,
  dy: number,
  radius = STICK_RADIUS,
  deadZone = DEAD_ZONE,
): [number, number] {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return [0, 0];
  const mag = Math.min(1, len / radius);
  if (mag <= deadZone) return [0, 0];
  const scaled = (mag - deadZone) / (1 - deadZone);
  return [(-dy / len) * scaled, (dx / len) * scaled];
}

/**
 * Dokunmatik kontroller:
 *  - ekranın sol yarısı: dokunulan yerde beliren joystick (hareket)
 *  - sağ yarısı: sürükleyerek kamerayı döndürme
 *  - sağ altta ZIPLA / KAY, sağ üstte duraklat butonu
 * Pointer Events ile çalışır; her parmak pointerId ile ayrı izlenir (çoklu dokunuş).
 */
export class TouchControls {
  readonly el: HTMLDivElement;
  /** İlk dokunuştan sonra true; masaüstünde hiç açılmaz. */
  active = false;
  axes: [number, number] = [0, 0];
  slideHeld = false;
  cameraDragging = false;
  onPause: () => void = () => {};

  private jumpQueued = false;
  private lookX = 0;
  private lookY = 0;
  private visible = false;
  private stickId: number | null = null;
  private stickX = 0;
  private stickY = 0;
  private lookId: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private readonly base = h('div.stick-base', {}, h('div.stick-knob'));
  private readonly hint = h('div.touch-hint', {}, 'Sol: sürükle → koş · Sağ: sürükle → kamera');

  constructor(parent: HTMLElement, startActive: boolean) {
    const jump = h(
      'button.touch-btn.touch-jump',
      { 'data-testid': 'touch-jump', 'aria-label': 'Zıpla' },
      'ZIPLA',
    );
    const slide = h(
      'button.touch-btn.touch-slide',
      { 'data-testid': 'touch-slide', 'aria-label': 'Kay' },
      'KAY',
    );
    const pause = h('button.touch-pause', { 'data-testid': 'touch-pause', 'aria-label': 'Duraklat' }, 'II');
    this.el = h(
      'div.touch-layer',
      { 'data-testid': 'touch-layer' },
      this.base,
      this.hint,
      slide,
      jump,
      pause,
    );
    parent.append(this.el);

    const press = (btn: HTMLElement, down: () => void, up?: () => void) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add('pressed');
        down();
      });
      const release = (e: Event) => {
        e.stopPropagation();
        btn.classList.remove('pressed');
        up?.();
      };
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
    };
    press(jump, () => {
      this.jumpQueued = true;
    });
    press(
      slide,
      () => {
        this.slideHeld = true;
      },
      () => {
        this.slideHeld = false;
      },
    );
    press(pause, () => this.onPause());

    this.el.addEventListener('pointerdown', (e) => this.onDown(e));
    this.el.addEventListener('pointermove', (e) => this.onMove(e));
    this.el.addEventListener('pointerup', (e) => this.onUp(e));
    this.el.addEventListener('pointercancel', (e) => this.onUp(e));

    // Herhangi bir yerde ilk dokunuş → dokunmatik moda geç (menüdeki OYNA dahil).
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch') this.activate();
      },
      { capture: true },
    );
    if (startActive) this.activate();
    this.setVisible(false);
  }

  activate(): void {
    if (this.active) return;
    this.active = true;
    document.body.classList.add('touch');
    this.setVisible(this.visible);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.el.style.display = v && this.active ? '' : 'none';
    if (!v) this.reset();
  }

  consumeJump(): boolean {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  consumeLook(): [number, number] {
    const r: [number, number] = [this.lookX, this.lookY];
    this.lookX = 0;
    this.lookY = 0;
    return r;
  }

  reset(): void {
    this.stickId = null;
    this.lookId = null;
    this.axes = [0, 0];
    this.slideHeld = false;
    this.cameraDragging = false;
    this.jumpQueued = false;
    this.lookX = 0;
    this.lookY = 0;
    this.base.style.display = 'none';
  }

  private onDown(e: PointerEvent): void {
    e.preventDefault();
    if (e.clientX < window.innerWidth / 2 && this.stickId === null) {
      this.stickId = e.pointerId;
      this.stickX = e.clientX;
      this.stickY = e.clientY;
      this.base.style.display = 'block';
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.moveKnob(0, 0);
      this.hint.style.display = 'none';
    } else if (this.lookId === null) {
      this.lookId = e.pointerId;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.cameraDragging = true;
    } else {
      return;
    }
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // Sentetik olaylarda (testler) yakalama başarısız olabilir; sorun değil.
    }
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId === this.stickId) {
      const dx = e.clientX - this.stickX;
      const dy = e.clientY - this.stickY;
      this.axes = joystickAxes(dx, dy);
      const len = Math.hypot(dx, dy);
      const k = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
      this.moveKnob(dx * k, dy * k);
    } else if (e.pointerId === this.lookId) {
      this.lookX += e.clientX - this.lastX;
      this.lookY += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    }
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.axes = [0, 0];
      this.base.style.display = 'none';
    } else if (e.pointerId === this.lookId) {
      this.lookId = null;
      this.cameraDragging = false;
    }
  }

  private moveKnob(dx: number, dy: number): void {
    const knob = this.base.firstElementChild as HTMLElement;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}
