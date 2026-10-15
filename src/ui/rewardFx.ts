import { h } from './dom';

/** Nadirlik renkleri (CSS --r-* ile aynı). */
export const RARITY_COLORS = ['#b9b4cc', '#4fb3ff', '#c77dff', '#ffb627'];
const CONFETTI = ['#ffd34d', '#ff6b6b', '#4fb3ff', '#7dffb0', '#c77dff', '#ffffff'];

export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Kısa ömürlü efekt öğesi: animasyon bitince kendini siler. */
function fx(
  parent: HTMLElement,
  cls: string,
  vars: Record<string, string | number>,
  life: number,
): HTMLElement {
  const el = h(`div.${cls}`);
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, String(v));
  parent.append(el);
  setTimeout(() => el.remove(), life);
  return el;
}

/**
 * Nadirliğe göre açılış efekti. `host` kartın/sahnenin kapsayıcısı (halka, kıvılcım, ışın, damga),
 * `layer` tam ekran katman (flaş, konfeti).
 *  Sıradan: yumuşak parıltı · Nadir: mavi halka + kıvılcım · Epik: mor ışınlar, daha çok parçacık,
 *  hafif sarsıntı · Efsanevi: dönen altın ışınlar, konfeti, ekran flaşı, sarsıntı, damga.
 */
export function revealBurst(host: HTMLElement, layer: HTMLElement, rarity: number, stamp = ''): void {
  const c = RARITY_COLORS[rarity] ?? RARITY_COLORS[0];
  const calm = reducedMotion();
  host.style.setProperty('--fx', c);
  fx(host, 'fx-glow', {}, 1600);
  if (rarity >= 1) fx(host, 'fx-ring', {}, 1200);
  if (rarity >= 2) fx(host, `fx-rays${rarity >= 3 ? '.gold' : ''}`, {}, rarity >= 3 ? 4000 : 2400);
  if (!calm) {
    const sparks = [6, 12, 22, 34][rarity] ?? 6;
    for (let k = 0; k < sparks; k++) {
      const a = (k / sparks) * Math.PI * 2 + Math.random() * 0.4;
      const d = 90 + Math.random() * (60 + rarity * 50);
      fx(
        host,
        'fx-spark',
        {
          '--dx': `${Math.cos(a) * d}px`,
          '--dy': `${Math.sin(a) * d}px`,
          '--s': `${4 + Math.random() * (3 + rarity * 2)}px`,
          '--d': `${0.5 + Math.random() * 0.5}s`,
        },
        1200,
      );
    }
    if (rarity >= 2) {
      host.classList.remove('fx-shake', 'fx-shake-big');
      void host.offsetWidth;
      host.classList.add(rarity >= 3 ? 'fx-shake-big' : 'fx-shake');
    }
  }
  if (rarity >= 3) {
    fx(layer, 'fx-flash', {}, 900);
    if (!calm) {
      for (let k = 0; k < 60; k++) {
        fx(
          layer,
          'fx-confetti',
          {
            '--x': `${Math.random() * 100}vw`,
            '--dx': `${(Math.random() - 0.5) * 160}px`,
            '--rot': `${(Math.random() - 0.5) * 1440}deg`,
            '--delay': `${Math.random() * 0.5}s`,
            '--dur': `${1.8 + Math.random() * 1.4}s`,
            '--c': CONFETTI[k % CONFETTI.length],
          },
          4000,
        );
      }
    }
  }
  if (stamp) fx(host, 'fx-stamp', {}, 2600).textContent = stamp;
}
