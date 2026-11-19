// Generates all bundled art with no dependencies (original work, safe to redistribute):
//   assets/sheep.png                     8-frame walk strip for the built-in bounce sheep
//   assets/tray.png                      32x32 tray icon
//   assets/packs/woolly/animations.xml   a full classic-format pack (walk, sleep, drag, toss, ...)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const encodePng = (w, h, rgba) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

/** A w*h RGBA pixel buffer with a couple of drawing primitives. */
const canvas = (w, h) => {
  const buf = Buffer.alloc(w * h * 4);
  const put = (x, y, [r, g, b]) => {
    if (x >= 0 && x < w && y >= 0 && y < h) buf.set([r, g, b, 255], (y * w + x) * 4);
  };
  const ellipse = (cx, cy, rx, ry, col) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) put(x, y, col);
  };
  const rect = (x0, y0, rw, rh, col) => {
    for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) put(x, y, col);
  };
  return { w, h, buf, ellipse, rect };
};

/** Copy `src` into `dst` at (ox, oy), optionally mirrored or rotated about its centre. */
const blit = (dst, src, ox, oy, transform = (x, y) => [x, y]) => {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const [sx, sy] = transform(x, y);
      const i = (sy * src.w + sx) * 4;
      if (src.buf[i + 3]) dst.buf.set(src.buf.subarray(i, i + 4), ((oy + y) * dst.w + ox + x) * 4);
    }
};
const flipX = (x, y) => [63 - x, y];
const rot90 = (x, y) => [y, 63 - x];
const rot270 = (x, y) => [63 - y, x];

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

// "woolly" classic pack. Classic art faces LEFT, so tiles are mirrored.
{
  const tiles = [
    ...walkFrames, // 0-7 walk
    sheepTile({ eye: 'closed', dy: 6, legLen: 13 }), // 8 sleep A
    sheepTile({ eye: 'closed', dy: 7, legLen: 12, bob: 1 }), // 9 sleep B
    sheepTile({ eye: 'wide', dy: -8, legLen: 20, swing: 5 }), // 10 hanging A
    sheepTile({ eye: 'wide', dy: -8, legLen: 20, swing: -5 }), // 11 hanging B
    sheepTile({ eye: 'wide', swing: 4 }), // 12 tumble A (rotated below)
    sheepTile({ eye: 'wide', swing: -4 }), // 13 tumble B (rotated below)
    sheepTile({ squashY: 4, legLen: 15 }), // 14 landed, squashed
    sheepTile({ legLen: 19 }), // 15 standing
  ];
  const transforms = tiles.map((_, i) => {
    if (i === 12) return (x, y) => flipX(...rot90(x, y));
    if (i === 13) return (x, y) => flipX(...rot270(x, y));
    return flipX;
  });
  const sheet = canvas(512, 128);
  tiles.forEach((t, i) => blit(sheet, t, (i % 8) * 64, Math.floor(i / 8) * 64, transforms[i]));
  const png = encodePng(512, 128, sheet.buf).toString('base64');

  const next = (p, only, id) => `<next probability="${p}" only="${only}">${id}</next>`;
  const point = (tag, x, y, i) =>
    `<${tag}><x>${x}</x><y>${y}</y><offsety>0</offsety><opacity>1</opacity><interval>${i}</interval></${tag}>`;
  const anim = ({
    id,
    name,
    x = [0, 0],
    y = [0, 0],
    i = [200, 200],
    repeat = 0,
    frames,
    action = 'none',
    nexts = [],
    border = [],
    gravity = [],
  }) =>
    `    <animation id="${id}"><name>${name}</name>${point('start', x[0], y[0], i[0])}${point('end', x[1], y[1], i[1])}` +
    `<sequence repeatfrom="0" repeat="${repeat}">${frames.map((f) => `<frame>${f}</frame>`).join('')}<action>${action}</action>${nexts.join('')}</sequence>` +
    (border.length ? `<border>${border.join('')}</border>` : '') +
    (gravity.length ? `<gravity>${gravity.join('')}</gravity>` : '') +
    `</animation>`;

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<animations xmlns="https://esheep.petrucci.ch/">
  <header>
    <author>eSheep contributors</author>
    <title>Woolly</title>
    <petname>Woolly</petname>
    <version>1.0</version>
    <info>Original generated art, MIT licensed. Generated by scripts/make-assets.mjs.</info>
    <application>1</application>
  </header>
  <image><tilesx>8</tilesx><tilesy>2</tilesy><skins>1</skins><png><![CDATA[${png}]]></png><transparency>None</transparency></image>
  <spawns>
    <spawn id="1" probability="80"><x>random*(screenW-imageW-50)/100+25</x><y>-imageH-20</y><next>5</next></spawn>
    <spawn id="2" probability="20"><x>screenW+10</x><y>areaH-imageH</y><next>1</next></spawn>
  </spawns>
  <animations>
${[
  anim({
    id: 1,
    name: 'walk',
    x: [-4, -4],
    i: [90, 90],
    repeat: 'random/10+3',
    frames: [0, 1, 2, 3, 4, 5, 6, 7],
    nexts: [next(80, 'none', 1), next(8, 'none', 3), next(6, 'none', 2)],
    border: [next(100, 'none', 2)],
    gravity: [next(100, 'none', 5)],
  }),
  anim({
    id: 2,
    name: 'turn',
    i: [400, 400],
    frames: [15],
    action: 'flip',
    nexts: [next(100, 'none', 1)],
  }),
  anim({
    id: 3,
    name: 'sleep',
    i: [500, 500],
    repeat: 6,
    frames: [8, 9],
    nexts: [next(100, 'none', 1)],
  }),
  anim({ id: 4, name: 'drag', i: [140, 140], frames: [10, 11] }),
  anim({
    id: 5,
    name: 'fall',
    y: [4, 16],
    i: [40, 40],
    repeat: 60,
    frames: [10, 11],
    border: [next(100, 'none', 6)],
  }),
  anim({ id: 6, name: 'land', i: [350, 350], frames: [14], nexts: [next(100, 'none', 1)] }),
  anim({ id: 7, name: 'toss', i: [70, 70], frames: [12, 13] }),
].join('\n')}
  </animations>
</animations>
`;
  write('packs/woolly/animations.xml', xml);
}
console.log('assets written');
