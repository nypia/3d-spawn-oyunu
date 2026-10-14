import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
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
      : // Modeller data URI olarak JS'e gömülü (~2 MB): uyarı eşiği buna göre.
        { target: 'es2022', chunkSizeWarningLimit: 4000 },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/sim/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
  },
}));
