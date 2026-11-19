import { _electron as electron, test } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

test('settings window', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'esheep-shot-'));
  const env = { ...process.env, ESHEEP_TEST: '1' } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: ['.', '--no-sandbox', `--user-data-dir=${userData}`],
    env,
  });
  try {
    const opened = app.waitForEvent('window', {
      predicate: (w) => w.url().endsWith('/settings.html'),
    });
    await app.evaluate(() =>
      (globalThis as unknown as { __esheep: { openSettings(): void } }).__esheep.openSettings(),
    );
    const page = await opened;
    await page.waitForFunction(() => document.querySelectorAll('#pack option').length > 1);
    await page.screenshot({ path: 'docs/screenshots/app-settings.png' });
  } finally {
    await app.close();
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
