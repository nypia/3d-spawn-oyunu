import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig(({ mode }) => ({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // Göreli yollar: GitHub Pages (/3d-spawn-oyunu/) ve itch.io alt klasörlerinde de çalışır.
  base: './',
  server: { host: true },
  build:
    mode === 'artifact'
      ? {
          // claude.ai Artifact derlemesi: three.js CDN'den gelir, geri kalan tek HTML'e gömülür
          // (bkz. scripts/build-artifact.mjs).
          target: 'es2022',
          outDir: 'dist-artifact/build',
          emptyOutDir: true,
          modulePreload: false,
          minify: false,
          cssCodeSplit: false,
          rollupOptions: { external: ['three'] },
        }
      : // Modeller (~2,2 MB) ve sesler (~2,4 MB) data URI olarak JS'e gömülü: uyarı eşiği buna göre.
        { target: 'es2022', chunkSizeWarningLimit: 6500 },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/sim/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
  },
}));
