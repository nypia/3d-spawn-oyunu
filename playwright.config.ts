import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  // Masaüstü testi yüksek kalitede (bloom) koşar; yazılımsal GPU'da bu yavaş.
  timeout: 90_000,
  // Açılışta modeller yükleniyor; yazılımsal GPU'da kareler de yavaş.
  expect: { timeout: 15_000 },
  // Yazılımsal GPU'da (CI, bulut) paralel testler birbirini yavaşlatıyor.
  workers: 1,
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'desktop', testMatch: 'smoke.spec.ts', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', testMatch: 'touch.spec.ts', use: { ...devices['Pixel 7 landscape'] } },
  ],
});
