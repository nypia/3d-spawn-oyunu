import { expect, test } from '@playwright/test';

interface ChestHandle {
  current: {
    state: string;
    world: {
      player: { x: number; z: number };
      itemCounts: number[];
      interactables: { addRewardChest(x: number, z: number, rot: number, tier: number): number };
    };
  };
}

/** Sayfa içinde çalışır: page.evaluate fonksiyonu serileştirdiği için her çağrıda yeniden okunur. */
const G = 'window.game.current';

test('ücretsiz sandık: çark döner, E atlatır, AL eşyayı verir', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/?seed=42&quality=low');
  await page.getByTestId('play').click();
  await expect.poll(() => page.evaluate(`${G}.state`)).toBe('playing');

  // Oyuncunun dibine boss sandığı (3 eşya) koy: üstüne gelince açılır.
  await page.evaluate(() => {
    const w = (window as unknown as { game: ChestHandle }).game.current.world;
    w.interactables.addRewardChest(w.player.x + 0.4, w.player.z, 0, 2);
  });
  await expect(page.getByTestId('chest')).toBeVisible();
  expect(await page.evaluate(`${G}.state`)).toBe('reward');
  await expect(page.locator('.reel')).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath('1-reel.png') });

  // İlk E çarkı atlatır, sonuçlar görünür; ikinci E (ya da AL) ödülü alır.
  await page.keyboard.press('KeyE');
  await expect(page.locator('.panel.chest.revealed')).toBeVisible();
  await expect(page.locator('.chest-results .card')).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath('2-reveal.png') });
  await page.getByTestId('take').click();
  await expect.poll(() => page.evaluate(`${G}.state`)).toBe('playing');
  const owned = await page.evaluate(() =>
    (window as unknown as { game: ChestHandle }).game.current.world.itemCounts.reduce((a, b) => a + b, 0),
  );
  expect(owned).toBe(3);
  expect(errors).toEqual([]);
});
