import { expect, test, type Page } from '@playwright/test';

const open = async (page: Page, query = 'manual=1&seed=2'): Promise<void> => {
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => window.__demo?.ready());
};
const snap = (page: Page): Promise<DemoSnap> => page.evaluate(() => window.__demo.snapshot());
const step = (page: Page, ms: number): Promise<void> =>
  page.evaluate((n) => window.__demo.step(n), ms);
const monitor = (page: Page, i = 0) =>
  page
    .locator('.monitor')
    .nth(i)
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    });

const hideWindows = (page: Page): Promise<void> =>
  page
    .locator('.win')
    .evaluateAll((els) => els.forEach((e) => ((e as HTMLElement).style.display = 'none')));

/** Pointer position over the middle of the sheep's body. */
const body = async (page: Page): Promise<{ x: number; y: number }> => {
  const s = await snap(page);
  return { x: s.x + 20, y: s.y + 22 };
};

test('loads cleanly: title, controls and a sheep, with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const failed: string[] = [];
  page.on('requestfailed', (r) => failed.push(r.url()));
  await open(page);
  await expect(page).toHaveTitle('eSheep demo');
  await expect(page.locator('#sheep')).toBeVisible();
  await expect(page.locator('#pack')).toHaveValue('woolly');
  await expect(page.locator('.win')).toHaveCount(2);
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
});

test('the woolly sheep falls in from above, lands on the floor and walks', async ({ page }) => {
  await open(page);
  const floor = (await monitor(page)).bottom;
  const first = await snap(page);
  expect(first.y).toBeLessThan(floor - 300); // spawned up at the top, not on the floor
  await step(page, 12000);
  const later = await snap(page);
  expect(later.y + 40).toBeCloseTo(floor, 0);
});

test('only redistributable art is served', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(new URL(r.url()).pathname));
  await open(page);
  expect(urls).toContain('/packs/woolly.json');
  expect(urls.some((u) => u.includes('original'))).toBe(false);
  const pack = await (await page.request.get('/packs/woolly.json')).json();
  expect(pack.name).toBe('woolly');
  expect((await page.request.get('/packs/original.json')).status()).toBe(404);
});

test('grab picks the sheep up and it follows the pointer', async ({ page }) => {
  await open(page);
  await step(page, 6000);
  const p = await body(page);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await expect.poll(async () => (await snap(page)).mode).toBe('held');
  expect((await snap(page)).animation).toBe('drag');

  await page.mouse.move(p.x + 200, p.y - 150, { steps: 4 });
  const held = await snap(page);
  expect(held.x).toBeCloseTo(p.x + 200 - 20, 0);
  expect(held.y).toBeCloseTo(p.y - 150 - 22, 0);

  await step(page, 2000); // gravity does not act on a held sheep
  expect(await snap(page)).toMatchObject({ x: held.x, y: held.y, mode: 'held' });
  await page.mouse.up();
});

test('a flick tosses the sheep through the air and it lands and walks on', async ({ page }) => {
  await open(page);
  await hideWindows(page); // keep the flight path clear of the fake windows
  await step(page, 6000);
  const p = await body(page);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 40, p.y - 80, { steps: 3 });
  await page.mouse.move(p.x + 160, p.y - 300, { steps: 3 });
  await page.mouse.up();
  const thrown = await snap(page);
  expect(thrown).toMatchObject({ mode: 'thrown', animation: 'toss' });

  await step(page, 150);
  const flying = await snap(page);
  expect(flying.y).toBeLessThan(p.y - 22 - 100); // went up and to the right
  expect(flying.x).toBeGreaterThan(thrown.x);

  await step(page, 8000);
  const landed = await snap(page);
  expect(landed.mode).toBe('walk');
  expect(landed.y + 40).toBeCloseTo((await monitor(page)).bottom, 0);
});

test('releasing without a flick just drops the sheep', async ({ page }) => {
  await open(page);
  await step(page, 6000);
  const p = await body(page);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x, p.y - 200, { steps: 4 });
  await page.waitForTimeout(150); // pointer rests, so no throw velocity
  await page.mouse.up();
  expect(await snap(page)).toMatchObject({ mode: 'walk', animation: 'fall' });
});

test('clicks pass through transparent pixels but the sheep itself captures them', async ({
  page,
}) => {
  await open(page);
  await step(page, 6000);
  const p = await body(page);
  await page.mouse.move(p.x, p.y);
  await expect(page.locator('#sheep')).toHaveCSS('pointer-events', 'auto');
  await page.mouse.move(p.x, 100);
  await expect(page.locator('#sheep')).toHaveCSS('pointer-events', 'none');
});

test('the sheep lands on top of a window dragged underneath it', async ({ page }) => {
  await open(page);
  const spawn = await snap(page);
  const win = page.locator('[data-win="1"]');
  await win.evaluate((el, x) => {
    el.style.left = `${x - 60}px`;
    el.style.top = '420px';
  }, spawn.x);
  // Step until it touches down on the window (before it can walk off the end of it).
  const landed = await page.evaluate(() => {
    for (let i = 0; i < 400; i++) {
      window.__demo.step(50);
      const s = window.__demo.snapshot();
      if (Math.abs(s.y + 40 - 420) < 1) return s;
    }
    return window.__demo.snapshot();
  });
  expect(landed.y + 40).toBeCloseTo(420, 0);
});

test('windows can be dragged by their title bar', async ({ page }) => {
  await open(page);
  const bar = page.locator('[data-win="1"] .bar');
  const box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 220, box.y + 110, { steps: 5 });
  await page.mouse.up();
  const after = (await bar.boundingBox())!;
  expect(after.x).toBeCloseTo(box.x + 200, 0);
  expect(after.y).toBeCloseTo(box.y + 100, 0);
  await page.getByRole('button', { name: 'Reset windows' }).click();
  expect((await bar.boundingBox())!.x).toBeCloseTo(box.x, 0);
});

test('switching to the bounce sheep, pausing and resuming', async ({ page }) => {
  await open(page);
  await page.locator('#pack').selectOption('bounce');
  await expect.poll(async () => (await snap(page)).animation).toBe('bounce');
  const a = await snap(page);
  await step(page, 1000);
  const b = await snap(page);
  expect(b.x).not.toBe(a.x);

  await page.getByRole('button', { name: 'Pause' }).click();
  await step(page, 1000);
  expect(await snap(page)).toEqual(b);
  await page.getByRole('button', { name: 'Resume' }).click();
  await step(page, 1000);
  expect((await snap(page)).x).not.toBe(b.x);
});

test('the speed slider changes how far the bounce sheep travels', async ({ page }) => {
  await open(page);
  await page.locator('#pack').selectOption('bounce');
  await expect.poll(async () => (await snap(page)).animation).toBe('bounce');
  const start = await snap(page);
  await step(page, 500);
  const slow = await snap(page);
  await page.locator('#speed').fill('2');
  await page.locator('#speed').dispatchEvent('input');
  await step(page, 500);
  const fast = await snap(page);
  expect(Math.hypot(fast.x - slow.x, fast.y - slow.y)).toBeGreaterThan(
    Math.hypot(slow.x - start.x, slow.y - start.y),
  );
});

test('two monitors: the sheep can wander across both displays', async ({ page }) => {
  await open(page);
  await page.locator('#dual').check();
  await expect(page.locator('.monitor')).toHaveCount(2);
  await page.locator('#pack').selectOption('bounce');
  await expect.poll(async () => (await snap(page)).animation).toBe('bounce');
  const second = await monitor(page, 1);
  const seen = await page.evaluate(() => {
    const xs: number[] = [];
    for (let i = 0; i < 400; i++) {
      window.__demo.step(250);
      xs.push(window.__demo.snapshot().x);
    }
    return xs;
  });
  expect(Math.max(...seen)).toBeGreaterThan(second.left);
  expect(Math.min(...seen)).toBeLessThan((await monitor(page, 0)).right);
});

test('every classic animation can be played from the picker, including turning', async ({
  page,
}) => {
  await open(page);
  const picker = page.locator('#anim');
  await expect(picker).toBeEnabled();
  expect(await picker.locator('option').count()).toBeGreaterThan(50);
  await picker.selectOption('rotate1a');
  expect((await snap(page)).animation).toBe('rotate1a');
  await picker.selectOption('sleep1a');
  expect((await snap(page)).animation).toBe('sleep1a');
  await expect(picker).toHaveValue('');
  await page.locator('#pack').selectOption('bounce');
  await expect(picker).toBeDisabled();
});

test('more sheep can be added and removed, each with its own state', async ({ page }) => {
  await open(page);
  await expect(page.locator('#count')).toHaveText('1');
  await page.getByRole('button', { name: 'Add sheep' }).click();
  await page.getByRole('button', { name: 'Add sheep' }).click();
  await expect(page.locator('#count')).toHaveText('3');
  await expect(page.locator('canvas.sheep')).toHaveCount(3);
  await page.evaluate(() => window.__demo.step(6000));
  const all = await page.evaluate(() => window.__demo.snapshots());
  expect(all).toHaveLength(3);
  expect(new Set(all.map((s) => Math.round(s.x))).size).toBeGreaterThan(1); // not clones
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('canvas.sheep')).toHaveCount(2);
  // Removing never takes the last sheep.
  await page.getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('canvas.sheep')).toHaveCount(1);
});

test('switching pack keeps the number of sheep', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.__demo.add());
  await page.locator('#pack').selectOption('bounce');
  await expect.poll(() => page.evaluate(() => window.__demo.count())).toBe(2);
  await page.locator('#pack').selectOption('woolly');
  await expect.poll(() => page.evaluate(() => window.__demo.count())).toBe(2);
});

test('grabbing one sheep leaves the others alone', async ({ page }) => {
  await open(page);
  await hideWindows(page);
  await page.evaluate(() => window.__demo.add());
  await page.evaluate(() => window.__demo.step(8000));
  const [a, b] = await page.evaluate(() => window.__demo.snapshots());
  await page.mouse.move(a.x + 20, a.y + 22);
  await page.mouse.down();
  await page.mouse.move(a.x + 220, a.y - 100, { steps: 4 });
  const [held, other] = await page.evaluate(() => window.__demo.snapshots());
  expect(held.mode).toBe('held');
  expect(other.mode).not.toBe('held');
  expect(Math.abs(other.x - b.x)).toBeLessThan(400);
  await page.mouse.up();
});
