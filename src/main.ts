import { Game } from './core/Game';
import { loadAssets } from './render/assets/loadAssets';
import { loadFonts } from './ui/fonts';
import './ui/styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('#app bulunamadı');

function fatal(app: HTMLElement, err: unknown): void {
  console.error(err);
  app.innerHTML =
    '<div class="fatal">Oyun başlatılamadı. Tarayıcınız WebGL desteklemiyor olabilir.<br><small></small></div>';
  const small = app.querySelector('small');
  if (small) small.textContent = String(err);
}

/** Modeller yüklenirken ilerleme çubuklu açılış ekranı. */
function loadingScreen(app: HTMLElement): {
  set: (done: number, total: number) => void;
  message: (text: string) => void;
  remove: () => void;
} {
  // index.html'deki statik açılış yazısı: betik geldi, yerini ilerleme çubuğu alır.
  for (const b of app.querySelectorAll('.boot-loading')) b.remove();
  const el = document.createElement('div');
  el.className = 'loading';
  el.innerHTML =
    '<div class="loading-title">SPAWN</div><div class="loading-bar"><div class="loading-fill"></div></div><div class="loading-text">Yükleniyor…</div>';
  app.append(el);
  const fill = el.querySelector<HTMLElement>('.loading-fill');
  const text = el.querySelector<HTMLElement>('.loading-text');
  return {
    set(done, total) {
      const pct = Math.round((done / Math.max(1, total)) * 100);
      if (fill) fill.style.transform = `scaleX(${pct / 100})`;
      if (text) text.textContent = `Yükleniyor… %${pct}`;
    },
    message(msg) {
      if (text) text.textContent = msg;
    },
    remove: () => el.remove(),
  };
}

async function boot(app: HTMLElement): Promise<void> {
  const loading = loadingScreen(app);
  try {
    const [assets] = await Promise.all([loadAssets(loading.set), loadFonts()]);
    loading.message('Hazırlanıyor…');
    const game = new Game(app, assets);
    // Shader derlemesi açılış ekranının arkasında; en fazla birkaç saniye beklenir.
    await Promise.race([game.warmUp(), new Promise((r) => setTimeout(r, 5000))]);
    loading.remove();
    // Olay dinleyicilerinde (tuş, buton) çıkan hatalar da donmak yerine hata ekranı açar.
    window.addEventListener('error', (e) => {
      // Tarayıcı uyarıları (ResizeObserver) ve başka kaynaklı "Script error." oyunu durdurmaz.
      if (!(e.error instanceof Error) || /ResizeObserver/.test(e.message)) return;
      game.crash(e.error);
    });
    window.addEventListener('unhandledrejection', (e) => console.warn('yakalanmamış söz:', e.reason));
    game.run();
  } catch (err) {
    loading.remove();
    fatal(app, err);
  }
}

void boot(root);
