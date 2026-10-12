import { Game } from './core/Game';
import './ui/styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('#app bulunamadı');

try {
  new Game(root).run();
} catch (err) {
  console.error(err);
  root.innerHTML =
    '<div class="fatal">Oyun başlatılamadı. Tarayıcınız WebGL desteklemiyor olabilir.<br><small></small></div>';
  const small = root.querySelector('small');
  if (small) small.textContent = String(err);
}
