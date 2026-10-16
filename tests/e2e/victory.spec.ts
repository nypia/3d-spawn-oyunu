import { expect, type Page, test } from '@playwright/test';

interface GameHandle {
  current: { state: string; world: { cycle: number; time: number; outcome: string | null } };
}

const game = (page: Page) =>
  page.evaluate(() => {
    const g = (window as unknown as { game: GameHandle }).game.current;
    return { state: g.state, cycle: g.world.cycle, time: g.world.time, outcome: g.world.outcome };
  });

test('zafer ekranı: devam Kan Ayı\'na geçer; menüye dönüş ve "Koşuyu bitir" özet gösterir', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?seed=7&debug');
  await page.getByTestId('play').click();
  await expect.poll(async () => (await game(page)).state).toBe('playing');
  await expect.poll(async () => (await game(page)).time, { timeout: 20_000 }).toBeGreaterThan(0.5);

  // Hile: final boss'u doğur ve öldür → zafer ekranı, sim durur.
  await page.keyboard.press('KeyV');
  await expect.poll(async () => (await game(page)).state).toBe('victory');
  await expect(page.getByTestId('victory')).toContainText('ZAFER');
  await expect(page.getByTestId('weapon-table')).toContainText('Büyü Oku');
  const frozen = (await game(page)).time;
  await page.waitForTimeout(600);
  expect((await game(page)).time).toBe(frozen);
  await page.screenshot({ path: testInfo.outputPath('1-victory.png') });

  await page.getByTestId('victory-continue').click();
  await expect.poll(async () => (await game(page)).state).toBe('playing');
  expect((await game(page)).cycle).toBe(2);
  await expect.poll(async () => (await game(page)).time, { timeout: 20_000 }).toBeGreaterThan(frozen + 1);

  // Duraklat: yapı paneli; Ana menü onaylıdır ve koşu özetine gider.
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await game(page)).state).toBe('paused');
  await expect(page.getByTestId('build-panel')).toContainText('Büyü Oku');
  await page.waitForTimeout(500);
  await page.screenshot({ path: testInfo.outputPath('2-pause-build.png') });
  await page.getByTestId('to-menu').click();
  await page.getByTestId('confirm-yes').click();
  await expect(page.getByTestId('gameover')).toContainText('Koşu bırakıldı');
  await expect(page.getByTestId('weapon-table')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: testInfo.outputPath('3-quit-summary.png') });
  await page.getByTestId('end-menu').click();
  await expect.poll(async () => (await game(page)).state).toBe('menu');
  await expect(page.getByTestId('play')).toBeVisible();

  // Yeni koşu → zafer → "Koşuyu bitir": başlık Zafer.
  await page.getByTestId('play').click();
  await expect.poll(async () => (await game(page)).state).toBe('playing');
  await expect.poll(async () => (await game(page)).time, { timeout: 20_000 }).toBeGreaterThan(0.3);
  await page.keyboard.press('KeyV');
  await expect.poll(async () => (await game(page)).state).toBe('victory');
  await page.getByTestId('victory-finish').click();
  await expect(page.getByTestId('gameover')).toContainText('Zafer!');
  expect((await game(page)).outcome).toBe('victory');
  await page.waitForTimeout(500);
  await page.screenshot({ path: testInfo.outputPath('4-victory-summary.png') });

  expect(errors).toEqual([]);
});
