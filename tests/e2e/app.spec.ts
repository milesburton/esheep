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
    const info = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return {
        ...w.getBounds(),
        onTop: w.isAlwaysOnTop(),
        focusable: w.isFocusable(),
        resizable: w.isResizable(),
      };
    });
    expect(info).toMatchObject({
      width: 128,
      height: 128,
      onTop: true,
      focusable: false,
      resizable: false,
    });
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
        'getWindows',
        'getWorkAreas',
        'isPaused',
        'listPacks',
        'loadPack',
        'loadPrefs',
        'moveWindow',
        'onPause',
        'onPrefsChanged',
        'onResume',
        'savePrefs',
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
    expect(await labels()).toEqual(['Pause', 'Settings…', 'Quit']);
  });

  test('Pause freezes the sheep and Resume releases it', async () => {
    await sheepPage();
    await toggle();
    expect(await labels()).toEqual(['Resume', 'Settings…', 'Quit']);
    await new Promise((r) => setTimeout(r, 300)); // let the pause message land
    const frozen = await sheepBounds();
    await new Promise((r) => setTimeout(r, 600));
    expect(await sheepBounds()).toEqual(frozen);

    await toggle();
    expect(await labels()).toEqual(['Pause', 'Settings…', 'Quit']);
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
      window.electronAPI.savePrefs({ speed: 99, sound: false, pack: '../../etc' }),
    );
    await expect
      .poll(() => page.evaluate(() => window.electronAPI.loadPrefs()))
      .toMatchObject({ speed: 2, sound: false, pack: 'builtin' });
  });

  test('switching to the woolly pack reloads the sheep, which falls in and lands on the taskbar line', async () => {
    const page = await openSettings();
    await page.locator('#pack').selectOption('woolly');
    await page.getByRole('button', { name: 'Save' }).click();
    const bottom = await page.evaluate(async () => {
      const [primary] = await window.electronAPI.getWorkAreas();
      return primary.y + primary.height;
    });
    // Classic sheep stands on the bottom of the work area (40px sprite centred in the 128px window: 44px pad above and below).
    await expect.poll(async () => (await sheepBounds()).y + 84, { timeout: 15_000 }).toBe(bottom);
  });
});

test.describe('grab and toss in the real app', () => {
  test('pointer events on the sheep canvas pick it up and put it down', async () => {
    const page = await sheepPage();
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
