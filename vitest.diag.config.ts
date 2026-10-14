import { defineConfig } from 'vitest/config';

// Denge tanısı: normal test koşusuna dahil değil (`npm run diag`).
export default defineConfig({
  test: {
    include: ['tests/diag/**/*.diag.ts'],
    environment: 'node',
    testTimeout: 600_000,
    silent: false,
  },
});
