import { test, type Page } from '@playwright/test';

const OUT = 'docs/screenshots';
const open = async (page: Page): Promise<void> => {
  await page.setViewportSize({ width: 1100, height: 640 });
  await page.goto('/?manual=1&seed=7');
  await page.waitForFunction(() => window.__demo?.ready());
};
const step = (page: Page, ms: number): Promise<void> =>
  page.evaluate((n) => window.__demo.step(n), ms);

test('walking', async ({ page }) => {
  await open(page);
  await step(page, 7000);
  await page.screenshot({ path: `${OUT}/demo-walk.png` });
});

test('grabbed', async ({ page }) => {
  await open(page);
  await step(page, 6000);
  const s = await page.evaluate(() => window.__demo.snapshot());
  await page.mouse.move(s.x + 64, s.y + 70);
  await page.mouse.down();
  await page.mouse.move(s.x + 300, s.y - 200, { steps: 6 });
  await page.screenshot({ path: `${OUT}/demo-grab.png` });
  await page.mouse.up();
});

test('two monitors', async ({ page }) => {
  await open(page);
  await page.locator('#dual').check();
  await page.locator('#pack').selectOption('bounce');
  await page.waitForFunction(() => window.__demo.snapshot()?.x !== undefined);
  await step(page, 9000);
  await page.screenshot({ path: `${OUT}/demo-dual.png` });
});
