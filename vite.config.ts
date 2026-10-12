import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Göreli yollar: GitHub Pages (/3d-spawn-oyunu/) ve itch.io alt klasörlerinde de çalışır.
  base: './',
  server: { host: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/sim/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
  },
});
