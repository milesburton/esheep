// Generates the tray icon (every Windows DPI step) and the app icon from one sprite of the original
// eSheep sheet: the front-facing sheep (tile 10), whose horns and face stay readable at 16px on both
// dark and light taskbars. Run `npm run icons` after changing the sprite; the PNGs are committed.
//   assets/tray.png (16px), tray@1.25x.png, tray@1.5x.png, tray@2x.png, tray@3x.png  (Electron picks the
//   right one for the display's scale), assets/icon.png (256px, window icon), build/icon.png (512px,
//   electron-builder turns it into the .ico / .icns / Linux icon).
/* global Image, document -- used inside page.evaluate, which runs in the browser */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.join(fileURLToPath(new URL('.', import.meta.url)), '..');
const TILE = 10;
const xml = fs.readFileSync(
  path.join(root, 'assets', 'packs', 'original', 'animations.xml'),
  'utf8',
);
const png = xml.match(/<image>[\s\S]*?<png><!\[CDATA\[([\s\S]*?)\]\]>/)?.[1].replace(/\s+/g, '');
if (!png) throw new Error('no sprite sheet found in the original pack');

const OUT = [
  ['assets/tray.png', 16],
  ['assets/tray@1.25x.png', 20],
  ['assets/tray@1.5x.png', 24],
  ['assets/tray@2x.png', 32],
  ['assets/tray@3x.png', 48],
  ['assets/icon.png', 256],
  ['build/icon.png', 512],
];

const browser = await chromium.launch();
const page = await browser.newPage();
const images = await page.evaluate(
  async ([data, tile, sizes]) => {
    const sheet = new Image();
    sheet.src = `data:image/png;base64,${data}`;
    await sheet.decode();
    // Cut the tile out and key the magenta background to transparent (as the app does).
    const t = document.createElement('canvas');
    t.width = t.height = 40;
    const g = t.getContext('2d');
    g.drawImage(sheet, (tile % 16) * 40, Math.floor(tile / 16) * 40, 40, 40, 0, 0, 40, 40);
    const px = g.getImageData(0, 0, 40, 40);
    let [x0, y0, x1, y1] = [40, 40, -1, -1];
    for (let i = 0; i < px.data.length; i += 4) {
      if (px.data[i] > 200 && px.data[i + 1] < 80 && px.data[i + 2] > 200) px.data[i + 3] = 0;
      if (px.data[i + 3]) {
        const p = i / 4;
        x0 = Math.min(x0, p % 40);
        x1 = Math.max(x1, p % 40);
        y0 = Math.min(y0, Math.floor(p / 40));
        y1 = Math.max(y1, Math.floor(p / 40));
      }
    }
    g.putImageData(px, 0, 0);
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    return sizes.map(([name, size]) => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const x = c.getContext('2d');
      const margin = Math.max(1, Math.round(size / 16));
      const fit = (size - 2 * margin) / Math.max(w, h);
      // Upscales are crisp pixel art (a whole-number factor where possible); downscales are smoothed.
      const scale = fit >= 1 ? Math.max(1, Math.floor(fit)) : fit;
      x.imageSmoothingEnabled = fit < 1;
      x.imageSmoothingQuality = 'high';
      const dw = Math.round(w * scale);
      const dh = Math.round(h * scale);
      x.drawImage(
        t,
        x0,
        y0,
        w,
        h,
        Math.round((size - dw) / 2),
        Math.round((size - dh) / 2),
        dw,
        dh,
      );
      return [name, c.toDataURL('image/png').split(',')[1]];
    });
  },
  [png, TILE, OUT],
);
await browser.close();
for (const [name, b64] of images) {
  fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  fs.writeFileSync(path.join(root, name), Buffer.from(b64, 'base64'));
  console.log('wrote', name);
}
