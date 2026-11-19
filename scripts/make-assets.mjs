// Generates all bundled art with no dependencies (original work, safe to redistribute):
//   assets/sheep.png                     8-frame walk strip for the built-in bounce sheep
//   assets/tray.png                      32x32 tray icon
//   assets/packs/woolly/animations.xml   a full classic-format pack (walk, sleep, drag, toss, ...)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

import { buildWoolly } from './classic/pack.mjs';
import { blit, canvas, encodePng } from './classic/png.mjs';

const WOOL = [248, 248, 248];
const EDGE = [190, 190, 200];
const DARK = [55, 50, 55];
const WHITE = [255, 255, 255];
const LID = [120, 120, 130];

/** One 64x64 sheep, facing right. */
const sheepTile = ({ bob = 0, swing = 0, legLen = 19, squashY = 0, eye = 'open', dy = 0 } = {}) => {
  const c = canvas(64, 64);
  const y0 = dy;
  const legTop = 44 + y0 + squashY;
  c.rect(18 + swing, legTop, 4, legLen, DARK);
  c.rect(24 - swing, legTop, 4, legLen, DARK);
  c.rect(38 - swing, legTop, 4, legLen, DARK);
  c.rect(44 + swing, legTop, 4, legLen, DARK);
  const ry = 14 - squashY;
  const rx = 19 + squashY;
  c.ellipse(30, 34 + bob + y0 + squashY, rx + 1, ry + 1, EDGE);
  c.ellipse(30, 34 + bob + y0 + squashY, rx, ry, WOOL);
  for (const [x, y] of [
    [16, 26],
    [24, 21],
    [34, 20],
    [43, 26],
    [18, 40],
    [30, 46],
    [42, 40],
  ]) {
    const yy = y + bob + y0 + squashY * 0.5;
    c.ellipse(x, yy, 7, 7 - squashY * 0.4, EDGE);
    c.ellipse(x, yy, 6, 6 - squashY * 0.4, WOOL);
  }
  const hy = 30 + bob + y0 + squashY;
  c.ellipse(51, hy, 8, 8, DARK);
  c.ellipse(45, hy - 6, 3, 4, DARK);
  if (eye === 'open') c.rect(53, hy - 3, 2, 2, WHITE);
  else if (eye === 'wide') {
    c.ellipse(54, hy - 2, 3, 3, WHITE);
    c.rect(54, hy - 2, 2, 2, DARK);
  } else c.rect(52, hy - 2, 4, 1, LID);
  return c;
};

const ASSETS = path.join(__dirname, '..', 'assets');
const write = (rel, data) => {
  const file = path.join(ASSETS, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
};

const walkFrames = Array.from({ length: 8 }, (_, i) =>
  sheepTile({
    bob: [0, -1, -2, -1, 0, -1, -2, -1][i],
    swing: Math.round(Math.sin((i / 8) * Math.PI * 2) * 3),
  }),
);

// Built-in bounce sheep: 8-frame strip facing right.
{
  const strip = canvas(512, 64);
  walkFrames.forEach((t, i) => blit(strip, t, i * 64, 0));
  write('sheep.png', encodePng(512, 64, strip.buf));
}

// Tray icon.
{
  const c = canvas(32, 32);
  c.ellipse(14, 16, 12, 11, EDGE);
  c.ellipse(14, 16, 11, 10, WOOL);
  c.ellipse(24, 15, 6, 7, DARK);
  c.rect(26, 13, 2, 2, WHITE);
  write('tray.png', encodePng(32, 32, c.buf));
}

// "woolly" classic pack: full 118-pose sheet and every classic animation.
write('packs/woolly/animations.xml', buildWoolly());
console.log('assets written');
