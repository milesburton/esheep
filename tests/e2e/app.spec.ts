import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Drive the real Electron app (main + preload + renderer) under a virtual display. */
let app: ElectronApplication;
let userData: string;

const launch = async (): Promise<ElectronApplication> => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'esheep-e2e-'));
  const env = { ...process.env, ESHEEP_TEST: '1' } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE; // set by some hosts (e.g. VS Code); would make Electron act as plain Node
  return electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${userData}`], env });
};

const sheepPage = async (): Promise<Page> => {
  const existing = app.windows().find((w) => w.url().endsWith('/app/index.html'));
  return (
    existing ??
    app.waitForEvent('window', { predicate: (w) => w.url().endsWith('/app/index.html') })
  );
};

const sheepBounds = (): Promise<Electron.Rectangle> =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) =>
      x.webContents.getURL().endsWith('/app/index.html'),
    );
    return w ? w.getBounds() : { x: 0, y: 0, width: 0, height: 0 };
  });

test.beforeEach(async () => {
  app = await launch();
});
test.afterEach(async () => {
  await app.close();
  fs.rmSync(userData, { recursive: true, force: true });
});

test.describe('sheep window', () => {
  test('is a small, transparent, always-on-top, click-through window', async () => {
    await sheepPage();
    const info = (): Promise<Electron.Rectangle & Record<string, unknown>> =>
      app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        return {
          ...w.getBounds(),
          onTop: w.isAlwaysOnTop(),
          focusable: w.isFocusable(),
          resizable: w.isResizable(),
        };
      });
    // The default pack is the bounce sheep, which has a fixed 128px window (the renderer sizes it).
    await expect
      .poll(info)
      .toMatchObject({ width: 128, height: 128, onTop: true, focusable: false, resizable: false });
  });

  test('exposes a narrow API and no Node to the renderer', async () => {
    const page = await sheepPage();
    const surface = await page.evaluate(() => ({
      api: Object.keys(window.electronAPI).sort(),
      hasRequire: typeof (window as unknown as { require?: unknown }).require,
      hasProcess: typeof (window as unknown as { process?: unknown }).process,
    }));
    expect(surface.hasRequire).toBe('undefined');
    expect(surface.hasProcess).toBe('undefined');
    expect(surface.api).toEqual(
      [
        'ballGrab',
        'ballMove',
        'ballRelease',
        'getBall',
        'getOtherSheep',
        'getTag',
        'getWindows',
        'getWorkAreas',
        'isPaused',
        'kickBall',
        'listPacks',
        'loadPack',
        'loadPrefs',
        'moveWindow',
        'onPause',
        'onPrefsChanged',
        'onResume',
        'savePrefs',
        'setWindowSize',
        'setClickThrough',
      ].sort(),
    );
  });

  test('renders without console errors and the sheep moves across the screen', async () => {
    const page = await sheepPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const a = await sheepBounds();
    await expect.poll(async () => (await sheepBounds()).x, { timeout: 5000 }).not.toBe(a.x);
    expect(errors).toEqual([]);
  });

  test('main answers window and display queries', async () => {
    const page = await sheepPage();
    const areas = await page.evaluate(() => window.electronAPI.getWorkAreas());
    expect(areas.length).toBeGreaterThanOrEqual(1);
    expect(areas[0].width).toBeGreaterThan(0);
    expect(Array.isArray(await page.evaluate(() => window.electronAPI.getWindows()))).toBe(true);
  });
});

test.describe('tray menu and pause', () => {
  const labels = (): Promise<string[]> =>
    app.evaluate(() =>
      (globalThis as unknown as { __esheep: { trayLabels(): string[] } }).__esheep.trayLabels(),
    );
  const toggle = (): Promise<void> =>
    app.evaluate(() =>
      (globalThis as unknown as { __esheep: { togglePause(): void } }).__esheep.togglePause(),
    );

  test('offers Pause, Settings and Quit', async () => {
    await sheepPage();
    expect(await labels()).toEqual([
      'Pause',
      'Add sheep',
      'Remove sheep',
      'Play tag',
      'Start kick-about',
      'Settings…',
      'Quit',
    ]);
  });

  test('Pause freezes the sheep and Resume releases it', async () => {
    await sheepPage();
    await toggle();
    expect(await labels()).toEqual([
      'Resume',
      'Add sheep',
      'Remove sheep',
      'Play tag',
      'Start kick-about',
      'Settings…',
      'Quit',
    ]);
    await new Promise((r) => setTimeout(r, 300)); // let the pause message land
    const frozen = await sheepBounds();
    await new Promise((r) => setTimeout(r, 600));
    expect(await sheepBounds()).toEqual(frozen);

    await toggle();
    expect(await labels()).toEqual([
      'Pause',
      'Add sheep',
      'Remove sheep',
      'Play tag',
      'Start kick-about',
      'Settings…',
      'Quit',
    ]);
    await expect.poll(async () => (await sheepBounds()).x, { timeout: 5000 }).not.toBe(frozen.x);
  });
});

test.describe('settings', () => {
  const openSettings = async (): Promise<Page> => {
    await sheepPage();
    const opened = app.waitForEvent('window', {
      predicate: (w) => w.url().endsWith('/settings.html'),
    });
    await app.evaluate(() =>
      (globalThis as unknown as { __esheep: { openSettings(): void } }).__esheep.openSettings(),
    );
    const page = await opened;
    await page.waitForLoadState('domcontentloaded');
    return page;
  };

  test('shows defaults and lists the available sprite packs', async () => {
    const page = await openSettings();
    await expect(page.locator('#speed')).toHaveValue('1');
    await expect(page.locator('#sound')).not.toBeChecked();
    const packs = await page.locator('#pack option').allTextContents();
    expect(packs).toEqual(expect.arrayContaining(['builtin', 'woolly']));
    await expect(page.locator('#pack')).toHaveValue('builtin');
  });

  test('saving persists preferences (and clamps out-of-range values)', async () => {
    const page = await openSettings();
    await page.locator('#speed').fill('1.5');
    await page.locator('#sound').check();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('#status')).toHaveText('Saved');
    expect(await page.evaluate(() => window.electronAPI.loadPrefs())).toMatchObject({
      speed: 1.5,
      sound: true,
    });

    page.evaluate(() =>
      window.electronAPI.savePrefs({
        speed: 99,
        sound: false,
        pack: '../../etc',
        count: 99,
        scale: 99,
      }),
    );
    await expect
      .poll(() => page.evaluate(() => window.electronAPI.loadPrefs()))
      .toMatchObject({ speed: 2, sound: false, pack: 'builtin', count: 12, scale: 4 });
  });

  test('the Size setting scales the sprite and its window, and persists', async () => {
    const page = await openSettings();
    await page.locator('#pack').selectOption('woolly');
    await page.locator('#scale').selectOption('2');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('#status')).toHaveText('Saved');
    expect(await page.evaluate(() => window.electronAPI.loadPrefs())).toMatchObject({ scale: 2 });
    // 40px sprite x2, plus the 6px margin on every side.
    await expect.poll(async () => (await sheepBounds()).width, { timeout: 15_000 }).toBe(92);
    const bottom = await page.evaluate(async () => {
      const [primary] = await window.electronAPI.getWorkAreas();
      return primary.y + primary.height;
    });
    await expect.poll(async () => (await sheepBounds()).y + 86, { timeout: 15_000 }).toBe(bottom);
  });

  test('switching to the woolly pack reloads the sheep, which falls in and lands on the taskbar line', async () => {
    const page = await openSettings();
    await page.locator('#pack').selectOption('woolly');
    await page.getByRole('button', { name: 'Save' }).click();
    const bottom = await page.evaluate(async () => {
      const [primary] = await window.electronAPI.getWorkAreas();
      return primary.y + primary.height;
    });
    // A classic sheep stands on the bottom of the work area. Its window is the 40px sprite plus a 6px
    // margin on every side (52px), so the feet are 46px below the window's top.
    await expect.poll(async () => (await sheepBounds()).y + 46, { timeout: 15_000 }).toBe(bottom);
    expect(await sheepBounds()).toMatchObject({ width: 52, height: 52 });
  });
});

test.describe('kick-about', () => {
  type BallInfo = {
    active: boolean;
    held: boolean;
    kicks: number;
    windows: number;
    ball: { x: number; y: number; size: number; vx: number; vy: number } | null;
  };
  type Seam = {
    startKickAbout(): void;
    stopKickAbout(): void;
    kickAbout(): BallInfo;
    placeBall(x: number, y: number): void;
    trayLabels(): string[];
  };
  const seam = <T>(fn: (s: Seam) => T): Promise<T> =>
    app.evaluate(
      (_e, src) =>
        new Function('s', `return (${src})(s)`)(
          (globalThis as unknown as { __esheep: Seam }).__esheep,
        ) as unknown,
      fn.toString(),
    ) as Promise<T>;
  const info = (): Promise<BallInfo> => seam((s) => s.kickAbout());
  const floor = async (page: Page): Promise<number> =>
    page.evaluate(async () => {
      const [primary] = await window.electronAPI.getWorkAreas();
      return primary.y + primary.height;
    });
  const ballPage = async (): Promise<Page> => {
    const existing = app.windows().find((w) => w.url().endsWith('/app/ball.html'));
    return (
      existing ??
      app.waitForEvent('window', { predicate: (w) => w.url().endsWith('/app/ball.html') })
    );
  };

  test('the tray offers it, and a ball window appears, falls and settles on the floor', async () => {
    const first = await sheepPage();
    expect(await seam((s) => s.trayLabels())).toContain('Start kick-about');
    expect((await info()).active).toBe(false);
    await seam((s) => s.startKickAbout());
    expect(await seam((s) => s.trayLabels())).toContain('Stop kick-about');
    await ballPage();
    const bottom = await floor(first);
    await expect.poll(async () => (await info()).ball?.y, { timeout: 20_000 }).toBe(bottom - 14);
    expect((await info()).windows).toBe(1);
    // The window is the ball: 14px, sitting where the simulation says.
    const win = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().endsWith('/app/ball.html'))
        ?.getBounds(),
    );
    expect(win).toMatchObject({ width: 14, height: 14 });
    await seam((s) => s.stopKickAbout());
    expect((await info()).windows).toBe(0);
    expect(await seam((s) => s.trayLabels())).toContain('Start kick-about');
  });

  test('sheep run at the ball and kick it', async () => {
    test.setTimeout(120_000);
    const page = await sheepPage();
    // Classic sheep (the bounce sheep ignores the ball), two of them so a flock is involved.
    page.evaluate(() =>
      window.electronAPI.savePrefs({ speed: 1, sound: false, pack: 'woolly', count: 2, scale: 1 }),
    );
    const bottom = await floor(page);
    await expect.poll(async () => (await sheepBounds()).y + 46, { timeout: 25_000 }).toBe(bottom);
    await seam((s) => s.startKickAbout());
    await ballPage();
    // Sheep are random (one may be asleep, which deliberately ignores the ball), so keep putting the
    // ball on the floor just ahead of the first sheep until somebody kicks it.
    const place = async (): Promise<void> => {
      const sprite = await sheepBounds(); // 52px window: 6px margin around the 40px sprite
      await app.evaluate(
        (_e, [x, y]) =>
          (
            globalThis as unknown as { __esheep: { placeBall(x: number, y: number): void } }
          ).__esheep.placeBall(x, y),
        [sprite.x + 6 + 40 + 5, bottom - 14],
      );
    };
    await expect
      .poll(
        async () => {
          if ((await info()).kicks === 0) await place();
          await page.waitForTimeout(2000);
          return (await info()).kicks;
        },
        { timeout: 90_000, intervals: [0] },
      )
      .toBeGreaterThan(0);
  });

  test('you can pick the ball up with the mouse and throw it', async () => {
    const first = await sheepPage();
    await seam((s) => s.startKickAbout());
    const page = await ballPage();
    const bottom = await floor(first);
    await expect.poll(async () => (await info()).ball?.y, { timeout: 20_000 }).toBe(bottom - 14);
    await page.mouse.move(7, 7);
    await page.mouse.down();
    await expect.poll(async () => (await info()).held).toBe(true);
    await page.mouse.move(40, -20, { steps: 4 });
    await page.mouse.move(120, -90, { steps: 4 });
    const carried = (await info()).ball;
    expect(carried?.vx).toBe(0); // frozen under the pointer while held
    expect(carried?.y).toBeLessThan(bottom - 60);
    await page.mouse.up();
    await expect.poll(async () => (await info()).held).toBe(false);
    // Released: it is back under physics and settles on the floor again.
    await expect.poll(async () => (await info()).ball?.y, { timeout: 20_000 }).toBe(bottom - 14);
  });

  test('changing the sprite size or pack ends the kick-about (the ball is sized to the sprite)', async () => {
    const page = await sheepPage();
    await seam((s) => s.startKickAbout());
    await ballPage();
    expect((await info()).active).toBe(true);
    page.evaluate(() =>
      window.electronAPI.savePrefs({ speed: 1, sound: false, pack: 'builtin', count: 1, scale: 2 }),
    );
    await expect.poll(async () => (await info()).active).toBe(false);
    await expect.poll(async () => (await info()).windows).toBe(0);
  });
});

test.describe('tag', () => {
  type Seam = {
    startTag(): void;
    stopTag(): void;
    tagState(): { it: number | null; tags: number } | null;
    sheepCount(): number;
    trayLabels(): string[];
  };
  const seam = <T>(fn: (s: Seam) => T): Promise<T> =>
    app.evaluate(
      (_e, src) =>
        new Function('s', `return (${src})(s)`)(
          (globalThis as unknown as { __esheep: Seam }).__esheep,
        ) as unknown,
      fn.toString(),
    ) as Promise<T>;
  const glowing = (): Promise<number> =>
    app.evaluate(({ BrowserWindow }) =>
      Promise.all(
        BrowserWindow.getAllWindows()
          .filter((w) => w.webContents.getURL().endsWith('/app/index.html'))
          .map((w) =>
            w.webContents.executeJavaScript(
              "document.querySelector('canvas').style.filter.includes('drop-shadow')",
            ),
          ),
      ).then((flags) => flags.filter(Boolean).length),
    );

  test('is unavailable for the bounce sheep, which cannot play', async () => {
    await sheepPage();
    await seam((s) => s.startTag());
    expect(await seam((s) => s.tagState())).toBeNull(); // builtin pack: no game
  });

  test('a game of tag: one sheep glows as "it", and it changes hands as sheep are caught', async () => {
    test.setTimeout(150_000);
    const page = await sheepPage();
    page.evaluate(() =>
      window.electronAPI.savePrefs({ speed: 2, sound: false, pack: 'woolly', count: 4, scale: 1 }),
    );
    await expect.poll(() => seam((s) => s.sheepCount())).toBe(4);
    const bottom = await page.evaluate(async () => {
      const [primary] = await window.electronAPI.getWorkAreas();
      return primary.y + primary.height;
    });
    await expect.poll(async () => (await sheepBounds()).y + 46, { timeout: 30_000 }).toBe(bottom);
    await seam((s) => s.startTag());
    expect(await seam((s) => s.trayLabels())).toContain('Stop tag');
    expect((await seam((s) => s.tagState()))?.it).not.toBeNull();
    await expect.poll(glowing, { timeout: 10_000 }).toBe(1);
    await expect
      .poll(async () => (await seam((s) => s.tagState()))?.tags ?? 0, {
        timeout: 120_000,
        intervals: [1000],
      })
      .toBeGreaterThan(0);
    expect(await glowing()).toBe(1); // still exactly one "it"
    await seam((s) => s.stopTag());
    expect(await seam((s) => s.tagState())).toBeNull();
    await expect.poll(glowing).toBe(0);
  });
});

test.describe('self-test (what CI runs against a packaged build)', () => {
  test('starts, renders a sheep, reports itself and exits cleanly', async () => {
    const out = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'esheep-selftest-')),
      'report.json',
    );
    const env = { ...process.env, ESHEEP_SELFTEST: out } as Record<string, string>;
    delete env.ELECTRON_RUN_AS_NODE;
    const t = await electron.launch({
      args: [
        '.',
        '--no-sandbox',
        `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'esheep-st-'))}`,
      ],
      env,
    });
    await new Promise<void>((resolve) => t.on('close', () => resolve()));
    const report = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(report).toMatchObject({
      rendered: true,
      sheepWindows: 1,
      platform: process.platform,
      nativeWindows: process.platform === 'linux' ? false : expect.any(Boolean),
    });
    expect(report.packs).toEqual(expect.arrayContaining(['builtin', 'woolly', 'original']));
    expect(report.version).toBe(JSON.parse(fs.readFileSync('package.json', 'utf8')).version);
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  });
});

test.describe('several sheep', () => {
  type Seam = {
    addSheep(): void;
    removeSheep(): void;
    sheepCount(): number;
    trayLabels(): string[];
  };
  const seam = <T>(fn: (s: Seam) => T): Promise<T> =>
    app.evaluate(
      (_e, src) =>
        new Function('s', `return (${src})(s)`)(
          (globalThis as unknown as { __esheep: Seam }).__esheep,
        ) as unknown,
      fn.toString(),
    ) as Promise<T>;
  const sheepWindows = (): Promise<number> =>
    app.evaluate(
      ({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().filter((w) =>
          w.webContents.getURL().endsWith('/app/index.html'),
        ).length,
    );

  test('the tray can add and remove sheep, one window each, never below one', async () => {
    await sheepPage();
    expect(await seam((s) => s.trayLabels())).toEqual(
      expect.arrayContaining(['Add sheep', 'Remove sheep']),
    );
    await seam((s) => s.addSheep());
    await seam((s) => s.addSheep());
    expect(await seam((s) => s.sheepCount())).toBe(3);
    await expect.poll(sheepWindows).toBe(3);
    await seam((s) => s.removeSheep());
    await seam((s) => s.removeSheep());
    await seam((s) => s.removeSheep());
    expect(await seam((s) => s.sheepCount())).toBe(1);
    await expect.poll(sheepWindows).toBe(1);
  });

  test('each sheep window can see the others (so they can leap over one another)', async () => {
    const first = await sheepPage();
    expect(await first.evaluate(() => window.electronAPI.getOtherSheep())).toEqual([]);
    await seam((s) => s.addSheep());
    await expect
      .poll(async () => (await first.evaluate(() => window.electronAPI.getOtherSheep())).length)
      .toBe(1);
    // Both windows are the bounce sheep's fixed 128px square once their renderers have sized them.
    await expect
      .poll(async () => (await first.evaluate(() => window.electronAPI.getOtherSheep()))[0]?.width)
      .toBe(128);
  });

  test('the Sheep setting opens that many windows, and every one runs its own sheep', async () => {
    const opened = app.waitForEvent('window', {
      predicate: (w) => w.url().endsWith('/settings.html'),
    });
    await app.evaluate(() =>
      (globalThis as unknown as { __esheep: { openSettings(): void } }).__esheep.openSettings(),
    );
    const page = await opened;
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#count').fill('3');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('#status')).toHaveText('Saved');
    await expect.poll(sheepWindows).toBe(3);
    expect(await page.evaluate(() => window.electronAPI.loadPrefs())).toMatchObject({ count: 3 });
    // Each window has its own renderer, so each sheep ends up somewhere different.
    await expect
      .poll(
        () =>
          app.evaluate(
            ({ BrowserWindow }) =>
              new Set(
                BrowserWindow.getAllWindows()
                  .filter((w) => w.webContents.getURL().endsWith('/app/index.html'))
                  .map((w) => w.getBounds().x),
              ).size,
          ),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(1);
  });
});

test.describe('grab and toss in the real app', () => {
  test('pointer events on the sheep canvas pick it up and put it down', async () => {
    const page = await sheepPage();
    // The window starts small and the renderer resizes it to the bounce sheep's 128px square; the
    // pointer coordinates below are only inside the window once that has happened.
    await expect.poll(async () => (await sheepBounds()).width).toBe(128);
    // Wait for the sprite to be drawn so there are opaque pixels to hit.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.querySelector('canvas')!.getContext('2d')!.getImageData(64, 70, 1, 1).data[3],
        ),
      )
      .toBeGreaterThan(16);
    const before = await sheepBounds();
    await page.mouse.move(64, 70);
    await page.mouse.down();
    await page.mouse.move(70, 75, { steps: 3 });
    await page.mouse.move(80, 90, { steps: 3 });
    // While held the window follows the pointer, not the drifting sheep.
    const held1 = await sheepBounds();
    await new Promise((r) => setTimeout(r, 300));
    const held2 = await sheepBounds();
    expect(held2).toEqual(held1);
    expect(held1).not.toEqual(before);
    await page.mouse.up();
  });
});
