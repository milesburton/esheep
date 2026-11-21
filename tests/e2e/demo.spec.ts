import { expect, test, type Page } from '@playwright/test';

const open = async (page: Page, query = 'manual=1&seed=2&pack=woolly'): Promise<void> => {
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

test('the original eSheep art is the default, and the generated pack is still available', async ({
  page,
}) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(new URL(r.url()).pathname));
  await open(page, 'manual=1&seed=2');
  await expect(page.locator('#pack')).toHaveValue('original');
  expect(urls).toContain('/packs/original.json');
  const original = await (await page.request.get('/packs/original.json')).json();
  expect(original).toMatchObject({ name: 'original', tilesX: 16, tilesY: 11 });
  expect(original.animations).toHaveLength(57); // the 56 classic animations plus the synthesised kick
  const woolly = await (await page.request.get('/packs/woolly.json')).json();
  expect(woolly.name).toBe('woolly');
  expect(await page.request.get('/packs/index.json').then((r) => r.json())).toEqual([
    'original',
    'woolly',
  ]);
  await page.locator('#pack').selectOption('woolly');
  await expect.poll(() => page.evaluate(() => window.__demo.ready())).toBe(true);
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

test('the Size picker scales the sheep and keeps the flock', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.__demo.add());
  const canvas = page.locator('#sheep');
  await expect(canvas).toHaveCSS('width', '52px'); // 40px sprite + 6px margin each side
  await page.locator('#scale').selectOption('3');
  await expect.poll(() => page.evaluate(() => window.__demo.count())).toBe(2);
  await expect(canvas).toHaveCSS('width', '132px'); // 40 x 3 + 12
  await page.evaluate(() => window.__demo.step(6000));
  const s = await snap(page);
  expect(s.y + 120).toBeLessThanOrEqual((await monitor(page)).bottom + 1); // 120px sprite fits on the floor
});

test('the canvas is rendered at device resolution so pixel art stays crisp', async ({
  browser,
}) => {
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();
  await open(page);
  const dims = await page.locator('#sheep').evaluate((c: HTMLCanvasElement) => ({
    backing: c.width,
    css: c.getBoundingClientRect().width,
  }));
  expect(dims).toEqual({ backing: 104, css: 52 }); // 52 CSS px at 2 device px each
  // Still hit-testable at the right place: clicking the sheep's centre picks it up.
  await page.evaluate(() => window.__demo.step(8000));
  const s = await snap(page);
  await page.mouse.move(s.x + 20, s.y + 22);
  await expect(page.locator('#sheep')).toHaveCSS('pointer-events', 'auto');
  await context.close();
});

test.describe('kick-about', () => {
  const ball = (page: Page) => page.evaluate(() => window.__demo.ball());
  const dist = (page: Page): Promise<number> =>
    page.evaluate(() => {
      const b = window.__demo.ball();
      const all = window.__demo.snapshots();
      return b
        ? Math.min(...all.map((s) => Math.hypot(s.x + 20 - (b.x + 7), s.y + 20 - (b.y + 7))))
        : -1;
    });

  test('the button toggles a ball, which falls and settles on the floor', async ({ page }) => {
    await open(page);
    await hideWindows(page);
    const button = page.getByRole('button', { name: 'Kick-about' });
    await expect(page.locator('#ball')).toHaveCount(0);
    await button.click();
    await expect(page.locator('#ball')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop kick-about' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await ball(page)).not.toBeNull();
    await page.getByRole('button', { name: 'Stop kick-about' }).click();
    await expect(page.locator('#ball')).toHaveCount(0);
    expect(await ball(page)).toBeNull();
  });

  test('sheep run at the ball and kick it around', async ({ page }) => {
    await open(page);
    await hideWindows(page);
    for (let i = 0; i < 3; i++) await page.evaluate(() => window.__demo.add());
    await page.evaluate(() => window.__demo.step(9000)); // let them all land first
    await page.evaluate(() => window.__demo.kickAbout(true));
    await page.evaluate(() => window.__demo.step(60_000));
    expect(await page.evaluate(() => window.__demo.kicks())).toBeGreaterThan(2);
    const b = await ball(page);
    expect(b).not.toBeNull();
  });

  test('you can throw the ball, and a sheep goes after it', async ({ page }) => {
    await open(page);
    await hideWindows(page);
    await page.evaluate(() => window.__demo.step(9000));
    await page.evaluate(() => window.__demo.kickAbout(true));
    await page.evaluate(() => window.__demo.step(4000)); // ball settles
    const b = (await ball(page))!;
    const box = (await page.locator('#ball').boundingBox())!;
    await page.mouse.move(box.x + 7, box.y + 7);
    await page.mouse.down();
    await page.mouse.move(box.x - 100, box.y - 120, { steps: 3 });
    await page.mouse.move(box.x - 330, box.y - 330, { steps: 3 });
    await expect(page.locator('#ball')).toHaveCSS('cursor', 'grab');
    const held = (await ball(page))!;
    expect(held.x).toBeLessThan(b.x - 200); // follows the pointer while held
    await page.mouse.up();
    const thrown = (await ball(page))!;
    expect(Math.hypot(thrown.vx, thrown.vy)).toBeGreaterThan(300);
    await page.evaluate(() => window.__demo.step(6000)); // it lands and rolls
    const before = await dist(page);
    await page.evaluate(() => window.__demo.step(6000));
    const after = await dist(page);
    expect(after).toBeLessThan(before + 1); // the sheep is no further away, and usually much closer
  });
});

test.describe('tag', () => {
  test('the button starts a game (adding a second sheep if needed) with exactly one sheep "it"', async ({
    page,
  }) => {
    await open(page);
    await expect(page.locator('canvas.sheep')).toHaveCount(1);
    await page.getByRole('button', { name: 'Play tag' }).click();
    await expect(page.locator('canvas.sheep')).toHaveCount(2); // it takes two to play
    await expect(page.getByRole('button', { name: 'Stop tag' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('canvas.sheep.it')).toHaveCount(1);
    const state = await page.evaluate(() => window.__demo.tag());
    expect(state).toMatchObject({ tags: 0 });
    await page.getByRole('button', { name: 'Stop tag' }).click();
    await expect(page.locator('canvas.sheep.it')).toHaveCount(0);
    expect(await page.evaluate(() => window.__demo.tag())).toBeNull();
  });

  test('"it" catches somebody, and the marker moves to the sheep that was tagged', async ({
    page,
  }) => {
    await open(page);
    await hideWindows(page);
    for (let i = 0; i < 3; i++) await page.evaluate(() => window.__demo.add());
    await page.evaluate(() => window.__demo.step(9000)); // let everyone land
    await page.evaluate(() => window.__demo.tagPlay(true));
    const seen = new Set<number>();
    let tags = 0;
    for (let i = 0; i < 90 && tags < 3; i++) {
      await page.evaluate(() => window.__demo.step(2000));
      const t = (await page.evaluate(() => window.__demo.tag()))!;
      seen.add(t.it);
      tags = t.tags;
      expect(await page.locator('canvas.sheep.it').count()).toBe(1);
    }
    expect(tags).toBeGreaterThan(0);
    expect(seen.size).toBeGreaterThan(1); // "it" really changed hands
  });

  test('the game survives a pack switch (the sheep are rebuilt and a new game is dealt)', async ({
    page,
  }) => {
    await open(page);
    for (let i = 0; i < 2; i++) await page.evaluate(() => window.__demo.add());
    await page.evaluate(() => window.__demo.tagPlay(true));
    await page.locator('#pack').selectOption('bounce');
    await expect.poll(() => page.evaluate(() => window.__demo.count())).toBe(3);
    await page.locator('#pack').selectOption('woolly');
    await expect
      .poll(() => page.evaluate(() => window.__demo.tag()?.it ?? -1))
      .toBeGreaterThanOrEqual(0);
    await expect(page.locator('canvas.sheep.it')).toHaveCount(1);
  });
});

test.describe('soccer', () => {
  /** Put the ball inside a goal mouth, as if it had been kicked in, and let the match notice. */
  const shoot = async (page: Page, side: 'left' | 'right'): Promise<void> => {
    const g = await page.locator(side === 'left' ? '.goal.red' : '.goal.blue').boundingBox();
    const size = await page.locator('#ball').evaluate((el) => el.getBoundingClientRect().width);
    await page.evaluate(([x, y]) => window.__demo.placeBall(x, y), [
      g!.x + 2,
      g!.y + g!.height - size,
    ] as const);
    await step(page, 32);
  };
  const KICKOFF = 2600;

  test('the button deals two teams of two, draws both goals and a scoreboard, and brings a ball', async ({
    page,
  }) => {
    await open(page);
    await page.getByRole('button', { name: 'Soccer' }).click();
    await expect(page.getByRole('button', { name: 'Stop soccer' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('canvas.sheep')).toHaveCount(4);
    await expect(page.locator('canvas.sheep.team-red')).toHaveCount(2);
    await expect(page.locator('canvas.sheep.team-blue')).toHaveCount(2);
    await expect(page.locator('.goal')).toHaveCount(2);
    await expect(page.locator('#ball')).toHaveCount(1);
    await expect(page.locator('#scoreboard')).toContainText('RED 0 – 0 BLUE');
    await expect(page.locator('#scoreboard')).toContainText('Kick-off');
    expect((await page.evaluate(() => window.__demo.match()))?.teams).toEqual([
      'red',
      'blue',
      'red',
      'blue',
    ]);
    await page.getByRole('button', { name: 'Stop soccer' }).click();
    await expect(page.locator('.goal, #scoreboard, canvas.sheep.team-red')).toHaveCount(0);
    expect(await page.evaluate(() => window.__demo.match())).toBeNull();
  });

  test('the goals sit on the floor at the two ends of the screen', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__demo.matchPlay(true));
    const screen = await monitor(page);
    const left = (await page.locator('.goal.red').boundingBox())!;
    const right = (await page.locator('.goal.blue').boundingBox())!;
    expect(Math.abs(left.x - screen.left)).toBeLessThan(2);
    expect(Math.abs(right.x + right.width - screen.right)).toBeLessThan(2);
    expect(Math.abs(left.y + left.height - screen.bottom)).toBeLessThan(2);
    expect(Math.abs(right.y + right.height - screen.bottom)).toBeLessThan(2);
  });

  test('a ball in the right goal scores for red, then restarts in the middle', async ({ page }) => {
    await open(page);
    await hideWindows(page);
    await page.evaluate(() => window.__demo.matchPlay(true));
    await step(page, KICKOFF);
    await shoot(page, 'right');
    expect(await page.evaluate(() => window.__demo.match())).toMatchObject({ red: 1, blue: 0 });
    await expect(page.locator('#scoreboard')).toContainText('RED 1 – 0 BLUE');
    const ball = (await page.evaluate(() => window.__demo.ball()))!;
    const screen = await monitor(page);
    expect(Math.abs(ball.x - (screen.left + screen.right) / 2)).toBeLessThan(40); // back at the centre
    // The kick-off pause: a second shot straight away does not count.
    await shoot(page, 'right');
    expect(await page.evaluate(() => window.__demo.match())).toMatchObject({ red: 1 });
  });

  test('a ball in the left goal scores for blue; five goals win the match, which then ends', async ({
    page,
  }) => {
    await open(page);
    await hideWindows(page);
    await page.evaluate(() => window.__demo.matchPlay(true));
    await step(page, KICKOFF);
    await shoot(page, 'left');
    expect(await page.evaluate(() => window.__demo.match())).toMatchObject({ red: 0, blue: 1 });
    for (let i = 0; i < 4; i++) {
      await step(page, KICKOFF);
      await shoot(page, 'left');
    }
    expect(await page.evaluate(() => window.__demo.match())).toMatchObject({
      blue: 5,
      winner: 'blue',
    });
    await expect(page.locator('#scoreboard')).toContainText('BLUE WINS');
    await step(page, 9000);
    expect(await page.evaluate(() => window.__demo.match())).toBeNull();
    await expect(page.locator('.goal')).toHaveCount(0);
  });

  test('the sheep really play: left alone on an open pitch they score goals', async ({ page }) => {
    await open(page);
    await hideWindows(page);
    await page.evaluate(() => window.__demo.step(6000)); // land
    await page.evaluate(() => window.__demo.matchPlay(true));
    let goals = 0;
    for (let i = 0; i < 150 && goals === 0; i++) {
      await step(page, 2000);
      const m = (await page.evaluate(() => window.__demo.match()))!;
      goals = m.red + m.blue;
    }
    expect(goals).toBeGreaterThan(0);
  });

  test('the bounce sheep cannot play', async ({ page }) => {
    await open(page, 'manual=1&seed=2&pack=bounce');
    await page.getByRole('button', { name: 'Soccer' }).click();
    expect(await page.evaluate(() => window.__demo.match())).toBeNull();
    await expect(page.locator('.goal')).toHaveCount(0);
  });

  test('tag and soccer are exclusive', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__demo.tagPlay(true));
    await page.evaluate(() => window.__demo.matchPlay(true));
    expect(await page.evaluate(() => window.__demo.tag())).toBeNull();
    await expect(page.locator('canvas.sheep.it')).toHaveCount(0);
  });
});

test('shrinking the browser window keeps every sheep on the (smaller) screen', async ({ page }) => {
  await open(page);
  await hideWindows(page);
  for (let i = 0; i < 4; i++) await page.evaluate(() => window.__demo.add());
  await page.evaluate(() => window.__demo.step(15_000));
  await page.setViewportSize({ width: 600, height: 420 });
  await page.evaluate(() => window.__demo.step(6000));
  const m = await monitor(page);
  const all = await page.evaluate(() => window.__demo.snapshots());
  expect(all).toHaveLength(5);
  for (const s of all) {
    expect(s.x).toBeGreaterThanOrEqual(m.left - 1);
    expect(s.x + 40).toBeLessThanOrEqual(m.right + 1);
    expect(s.y + 40).toBeLessThanOrEqual(m.bottom + 1); // not fallen through the new floor
    expect(s.y).toBeGreaterThan(-100);
  }
  // And growing it again lets them roam the larger screen (nobody is stuck in the corner).
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.evaluate(() => window.__demo.step(15_000));
  const m2 = await monitor(page);
  const xs = (await page.evaluate(() => window.__demo.snapshots())).map((s) => s.x);
  expect(Math.max(...xs)).toBeGreaterThan(m.right - m.left);
  expect(Math.max(...xs)).toBeLessThanOrEqual(m2.right);
});

test.describe('sheep never overlap', () => {
  /** Share of frames in which any two walking sheep interpenetrate (not counting one standing on a back). */
  const overlapShare = (page: Page, seconds: number): Promise<{ share: number; worst: number }> =>
    page.evaluate((secs) => {
      const S = 40;
      let frames = 0;
      let bad = 0;
      let worst = 0;
      for (let t = 0; t < secs * 1000; t += 16) {
        window.__demo.step(16);
        const a = window.__demo.snapshots();
        frames += 1;
        let any = false;
        for (let i = 0; i < a.length; i++)
          for (let j = i + 1; j < a.length; j++) {
            if (a[i].mode !== 'walk' || a[j].mode !== 'walk') continue;
            const dx = Math.min(a[i].x + S, a[j].x + S) - Math.max(a[i].x, a[j].x);
            const dy = Math.min(a[i].y + S, a[j].y + S) - Math.max(a[i].y, a[j].y);
            if (dx > 6 && dy > 0.3 * S) {
              any = true;
              worst = Math.max(worst, dx);
            }
          }
        if (any) bad += 1;
      }
      return { share: bad / frames, worst };
    }, seconds);

  test('a crowd of eight, with the windows in the way, passes through each other almost never', async ({
    page,
  }) => {
    await open(page, 'manual=1&seed=2');
    for (let i = 0; i < 7; i++) await page.evaluate(() => window.__demo.add());
    await page.evaluate(() => window.__demo.step(9000));
    const r = await overlapShare(page, 90);
    // Before sheep were solid this was about 27% of frames. What is left are the ~50ms when a
    // hopping sheep touches down where another has just stepped, and it slides clear.
    expect(r.share).toBeLessThan(0.01);
  });

  test('...and not during a game of tag either (the chaser has to stop beside who it catches)', async ({
    page,
  }) => {
    await open(page, 'manual=1&seed=2');
    for (let i = 0; i < 7; i++) await page.evaluate(() => window.__demo.add());
    await page.evaluate(() => window.__demo.step(9000));
    await page.evaluate(() => window.__demo.tagPlay(true));
    const r = await overlapShare(page, 90);
    expect(r.share).toBeLessThan(0.015); // was about 60% of frames
    expect((await page.evaluate(() => window.__demo.tag()))?.tags).toBeGreaterThan(0); // tag still works
  });
});

test.describe('a stuck ball and sheep that walk on the spot', () => {
  const monitorBottom = async (page: Page): Promise<number> => (await monitor(page)).bottom;

  test('a ball left on top of a window is dropped back in over open floor', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__demo.step(9000)); // let the sheep land
    await page.evaluate(() => window.__demo.kickAbout(true));
    await page.evaluate(() => window.__demo.step(3000));
    const win = await page
      .locator('.win')
      .first()
      .evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top };
      });
    // Park it on the window top, where nobody can get at it, and leave it.
    await page.evaluate(([x, y]) => window.__demo.placeBall(x, y), [win.left + 30, win.top - 14]);
    expect(await page.evaluate(() => window.__demo.ballResets())).toBe(0);
    await page.evaluate(() => window.__demo.step(7500));
    expect(await page.evaluate(() => window.__demo.ballResets())).toBeGreaterThanOrEqual(1);
    await page.evaluate(() => window.__demo.step(4000));
    const b = (await page.evaluate(() => window.__demo.ball()))!;
    expect(b.y + 14).toBeCloseTo(await monitorBottom(page), 0); // on the floor again, not on a window top
  });

  test('stopping a match takes away the ball the match brought', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => window.__demo.ball())).toBeNull();
    await page.evaluate(() => window.__demo.matchPlay(true));
    expect(await page.evaluate(() => window.__demo.ball())).not.toBeNull();
    await expect(page.locator('#ball')).toHaveCount(1);
    await page.evaluate(() => window.__demo.matchPlay(false));
    expect(await page.evaluate(() => window.__demo.ball())).toBeNull();
    await expect(page.locator('#ball')).toHaveCount(0); // it used to be left behind on the screen
  });

  test('a ball you already had out stays yours when a match ends', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__demo.kickAbout(true));
    await page.evaluate(() => window.__demo.matchPlay(true));
    await page.evaluate(() => window.__demo.matchPlay(false));
    expect(await page.evaluate(() => window.__demo.ball())).not.toBeNull();
  });

  test('in a match the ball never lies still for long, windows and all', async ({ page }) => {
    await open(page, 'manual=1&seed=2');
    await page.evaluate(() => window.__demo.step(9000));
    await page.evaluate(() => window.__demo.matchPlay(true));
    const longest = await page.evaluate(() => {
      let cur = 0;
      let best = 0;
      for (let t = 0; t < 120_000; t += 16) {
        window.__demo.step(16);
        const b = window.__demo.ball();
        if (!b) break;
        cur = Math.hypot(b.vx, b.vy) < 3 ? cur + 16 : 0;
        best = Math.max(best, cur);
      }
      return best / 1000;
    });
    // It used to sit still on a window top for 25-30 seconds. The reset is at 6s, plus time to settle.
    expect(longest).toBeLessThan(9);
  });

  test('in a game of tag no sheep runs on the spot for more than a few seconds', async ({
    page,
  }) => {
    for (const seed of [1, 3]) {
      await page.goto(`/?manual=1&seed=${seed}`);
      await page.waitForFunction(() => window.__demo?.ready());
      for (let i = 0; i < 5; i++) await page.evaluate(() => window.__demo.add());
      await page.evaluate(() => window.__demo.step(9000));
      await page.evaluate(() => window.__demo.tagPlay(true));
      const longest = await page.evaluate(() => {
        const moving = new Set(['walk', 'walk_win2', 'walk_task2', 'run', 'run_begin', 'run_end']);
        const n = window.__demo.count();
        const still = new Array(n).fill(0);
        const prev = window.__demo.snapshots().map((s) => s.x);
        let best = 0;
        for (let t = 0; t < 240_000; t += 16) {
          window.__demo.step(16);
          window.__demo.snapshots().forEach((s, i) => {
            const stuck =
              Math.abs(s.x - prev[i]) < 0.05 && moving.has(s.animation) && s.mode === 'walk';
            still[i] = stuck ? still[i] + 16 : 0;
            best = Math.max(best, still[i]);
            prev[i] = s.x;
          });
        }
        return best / 1000;
      });
      // Before the watchdog a runner pinned against a sheep ran on the spot for 6-8s.
      expect(longest, `seed ${seed}`).toBeLessThan(4);
    }
  });
});
