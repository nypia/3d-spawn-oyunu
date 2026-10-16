import { expect, test } from '@playwright/test';

interface GameHandle {
  current: { state: string; world: { player: { maxHp: number }; weapons: { def: { id: string } }[] } };
  meta: { silver: number };
}

test('ana menü: dükkândan güç al, kahraman aç, koşu güçle başlar', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Kayıtlı ilerleme: 1000 gümüş.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('spawn-oyunu.meta', JSON.stringify({ v: 1, silver: 1000 }));
    }
  });
  await page.goto('/?seed=9');
  await expect(page.getByTestId('silver')).toContainText('1.000');
  await expect(page.getByTestId('hero-su')).toContainText("Vampir Lordu'nu yen");
  await page.waitForTimeout(400);
  await page.screenshot({ path: testInfo.outputPath('1-menu.png') });

  // Dükkân: Dayanıklılık (40) al.
  await page.getByTestId('shop').click();
  await expect(page.getByTestId('shop-panel')).toBeVisible();
  await page.getByTestId('buy-vigor').click();
  await expect(page.getByTestId('silver')).toContainText('960');
  await page.waitForTimeout(400);
  await page.screenshot({ path: testInfo.outputPath('2-shop.png') });
  await page.getByTestId('shop-back').click();

  // Bora: 300 gümüşle aç.
  await page.getByTestId('hero-bora').click();
  await page.getByTestId('unlock-hero').click();
  await expect(page.getByTestId('silver')).toContainText('660');
  await expect(page.getByTestId('play')).toBeVisible();

  await page.getByTestId('play').click();
  const state = () =>
    page.evaluate(() => {
      const g = (window as unknown as { game: GameHandle }).game;
      return {
        state: g.current.state,
        maxHp: g.current.world.player.maxHp,
        weapon: g.current.world.weapons[0]?.def.id,
        silver: g.meta.silver,
      };
    });
  await expect.poll(async () => (await state()).state).toBe('playing');
  const s = await state();
  expect(s.weapon).toBe('boomerang');
  expect(s.maxHp).toBe(110);

  // Kayıt kalıcı: sayfa yenilenince gümüş ve kahraman aynı.
  await page.reload();
  await expect(page.getByTestId('silver')).toContainText('660');
  await expect(page.getByTestId('hero-bora')).toHaveClass(/active/);
  expect(errors).toEqual([]);
});
