import { expect, type Page, test } from '@playwright/test';

interface GameHandle {
  current: {
    state: string;
    world: { time: number; kills: number; offer: unknown; player: { x: number; z: number } };
  };
}

async function gameState(page: Page) {
  return page.evaluate(() => {
    const g = (window as unknown as { game: GameHandle }).game.current;
    return {
      state: g.state,
      time: g.world.time,
      kills: g.world.kills,
      x: g.world.player.x,
      z: g.world.player.z,
    };
  });
}

test('oyun açılır, oynanır ve seviye atlama çalışır', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/?seed=42&debug');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('play')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('1-menu.png') });

  await page.getByTestId('play').click();
  await expect.poll(async () => (await gameState(page)).state).toBe('playing');

  // İleri koş, zıpla, kay.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1200);
  await page.keyboard.press('Space');
  await page.waitForTimeout(600);
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(500);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');

  const s = await gameState(page);
  expect(s.time).toBeGreaterThan(1);
  expect(Math.hypot(s.x, s.z)).toBeGreaterThan(3);

  // Biraz düşman biriksin.
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: testInfo.outputPath('2-gameplay.png') });

  // Hile tuşu ile seviye atla → kart seç.
  await page.keyboard.press('KeyK');
  await expect.poll(async () => (await gameState(page)).state).toBe('levelup');
  await expect(page.getByTestId('card-0')).toBeVisible();
  await expect(page.getByTestId('slot-line')).toContainText('Silah 1/4');
  await expect(page.getByTestId('weapon-slots').locator('.slot')).toHaveCount(4);
  // Yenile: kartlar yeniden çekilir, ekran açık kalır.
  await page.getByTestId('reroll').click();
  await expect(page.getByTestId('reroll')).toContainText('(1)');
  await page.waitForTimeout(400);
  await page.screenshot({ path: testInfo.outputPath('3-levelup.png') });
  await page.getByTestId('card-0').click();
  await expect.poll(async () => (await gameState(page)).state).toBe('playing');

  // Esc → duraklat → Esc → devam
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await gameState(page)).state).toBe('paused');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await gameState(page)).state).toBe('playing');

  expect(errors).toEqual([]);
});
