// claude.ai Artifact için tek dosyalık sayfa üretir.
//  - three.js jsDelivr CDN'den ES modülü olarak yüklenir (Artifact CSP'si buna izin verir).
//  - Kendi kodumuz ve CSS inline gömülür.
//  - Artifact yayını sayfayı kendi <html>/<head>/<body> iskeletine sardığı için çıktı iskeletsizdir.
// Çıktılar:
//  dist-artifact/spawn.html    → yayınlanan dosya
//  dist-artifact/preview.html  → yerel test için iskelete sarılmış kopya
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const threeVersion = pkg.dependencies.three;
const threeUrl = `https://cdn.jsdelivr.net/npm/three@${threeVersion}/build/three.module.js`;

execSync('npx vite build --mode artifact', { stdio: 'inherit' });

const outDir = 'dist-artifact/build';
const html = readFileSync(join(outDir, 'index.html'), 'utf8');
const jsRel = html.match(/<script type="module"[^>]*src="([^"]+)"/)?.[1];
const cssRel = html.match(/<link rel="stylesheet"[^>]*href="([^"]+)"/)?.[1];
if (!jsRel) throw new Error('Derlenen index.html içinde modül script bulunamadı');

let js = readFileSync(join(outDir, jsRel), 'utf8');
js = js.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(["'])three\2/g, `$1$2${threeUrl}$2`);
// Yalnızca gerçek import/export satırlarına bak: three eklentilerinin JSDoc yorumlarında da
// `from 'three/addons/...'` geçiyor.
const bareStatic = /^\s*(?:import|export)\b[^\n]*?\bfrom\s*(["'])three(\/[^"']*)?\1/m;
const bareDynamic = /\bimport\s*\(\s*(["'])three(\/[^"']*)?\1\s*\)/;
if (bareStatic.test(js) || bareDynamic.test(js)) {
  throw new Error('Bundle içinde hâlâ çıplak "three" importu var');
}
js = js.replace(/<\/script/gi, '<\\/script');
const css = cssRel ? readFileSync(join(outDir, cssRel), 'utf8') : '';

const page = `<title>SPAWN</title>
<style>
${css}
</style>
<div id="app"></div>
<script type="module">
${js}
</script>
`;
const MAX_BYTES = 15 * 1024 * 1024;
if (Buffer.byteLength(page) > MAX_BYTES) throw new Error('spawn.html Artifact sınırına çok yakın (15 MB)');
writeFileSync('dist-artifact/spawn.html', page);
writeFileSync(
  'dist-artifact/preview.html',
  `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>\n${page}</body></html>\n`,
);
console.log(
  `dist-artifact/spawn.html: ${(Buffer.byteLength(page) / 1024).toFixed(1)} KB (three@${threeVersion} CDN'den)`,
);
