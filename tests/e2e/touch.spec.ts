import { expect, type Page, test } from '@playwright/test';

interface GameHandle {
  current: {
    state: string;
    world: { time: number; player: { x: number; z: number; grounded: boolean } };
  };
}

async function snap(page: Page) {
  return page.evaluate(() => {
    const g = (window as unknown as { game: GameHandle }).game.current;
    return { state: g.state, x: g.world.player.x, z: g.world.player.z, grounded: g.world.player.grounded };
  });
}

/** Dokunmatik katmana sentetik parmak olayı gönderir (pointerType: touch). */
async function finger(page: Page, type: string, id: number, x: number, y: number) {
  await page.evaluate(
    ({ type, id, x, y }) => {
      const layer = document.querySelector('[data-testid="touch-layer"]') as HTMLElement;
      layer.dispatchEvent(
        new PointerEvent(type, {
          pointerId: id,
          pointerType: 'touch',
          clientX: x,
          clientY: y,
          bubbles: true,
        }),
      );
    },
    { type, id, x, y },
  );
}

test('telefonda joystick, zıplama ve kartlar dokunmatikle çalışır', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?seed=42&debug');
  await expect(page.getByTestId('play')).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('touch-menu.png') });
  await page.getByTestId('play').tap();
  await expect.poll(async () => (await snap(page)).state).toBe('playing');
  await expect(page.getByTestId('touch-layer')).toBeVisible();
  await expect(page.getByTestId('touch-jump')).toBeVisible();

  // Sol yarıda joystick: yukarı sürükle → ileri koş.
  const start = await snap(page);
  await finger(page, 'pointerdown', 7, 160, 220);
  await finger(page, 'pointermove', 7, 160, 150);
  // Yazılımsal GPU'da kare hızı düşük olabilir: sabit bekleme yerine yer değiştirmeyi yokla.
  const distance = async () => {
    const s = await snap(page);
    return Math.hypot(s.x - start.x, s.z - start.z);
  };
  await expect.poll(distance, { timeout: 20_000 }).toBeGreaterThan(3);
  await page.screenshot({ path: testInfo.outputPath('touch-run.png') });
  await finger(page, 'pointerup', 7, 160, 150);

  // ZIPLA butonu → havada.
  await page.getByTestId('touch-jump').dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 9 });
  await expect.poll(async () => (await snap(page)).grounded, { intervals: [50] }).toBe(false);

  // Seviye atlama kartına dokun → oyun devam eder.
  await page.keyboard.press('KeyK');
  await expect.poll(async () => (await snap(page)).state).toBe('levelup');
  await expect(page.getByTestId('card-2')).toBeInViewport();
  await page.waitForTimeout(400);
  await page.screenshot({ path: testInfo.outputPath('touch-levelup.png') });
  await page.getByTestId('card-0').tap();
  await expect.poll(async () => (await snap(page)).state).toBe('playing');

  // Duraklat butonu.
  await page.getByTestId('touch-pause').dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 10 });
  await expect.poll(async () => (await snap(page)).state).toBe('paused');

  expect(errors).toEqual([]);
});
