// Builds the "woolly" classic pack: a tile sheet of original art plus an animations.xml whose
// sequencing (timings, transitions, spawns) follows Adriano Tiger's MIT-licensed desktopPet format
// and its classic eSheep behaviour, recorded in structure.json with frames named by pose.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { drawPose, TILE } from './art.mjs';
import { blit, canvas, encodePng } from './png.mjs';

const COLUMNS = 16;
const structure = JSON.parse(
  fs.readFileSync(fileURLToPath(new URL('./structure.json', import.meta.url)), 'utf8'),
);

export const buildWoolly = () => {
  const names = [...new Set(structure.animations.flatMap((a) => a.frames))];
  const rows = Math.ceil(names.length / COLUMNS);
  const sheet = canvas(COLUMNS * TILE, rows * TILE);
  names.forEach((n, i) =>
    blit(sheet, drawPose(n), (i % COLUMNS) * TILE, Math.floor(i / COLUMNS) * TILE),
  );
  const png = encodePng(sheet.w, sheet.h, sheet.buf).toString('base64');
  const index = new Map(names.map((n, i) => [n, i]));

  const next = (n) => `<next probability="${n.p}" only="${n.only}">${n.id}</next>`;
  const point = (tag, p) =>
    `<${tag}><x>${p.x}</x><y>${p.y}</y><offsety>${p.offsety}</offsety><opacity>${p.opacity}</opacity><interval>${p.interval}</interval></${tag}>`;
  const anim = (a) =>
    `    <animation id="${a.id}"><name>${a.name}</name>${point('start', a.start)}${point('end', a.end)}` +
    `<sequence repeatfrom="${a.repeatFrom}" repeat="${a.repeat}">${a.frames.map((f) => `<frame>${index.get(f)}</frame>`).join('')}` +
    `<action>${a.action}</action>${a.next.map(next).join('')}</sequence>` +
    (a.border.length ? `<border>${a.border.map(next).join('')}</border>` : '') +
    (a.gravity.length ? `<gravity>${a.gravity.map(next).join('')}</gravity>` : '') +
    `</animation>`;
  const spawn = (s, i) =>
    `    <spawn id="${i + 1}" probability="${s.p}"><x>${s.x}</x><y>${s.y}</y><next>${s.next}</next></spawn>`;

  return `<?xml version="1.0" encoding="utf-8"?>
<animations xmlns="https://esheep.petrucci.ch/">
  <header>
    <author>eSheep contributors</author>
    <title>Woolly</title>
    <petname>Woolly</petname>
    <version>2.0</version>
    <info>Original generated art, MIT licensed (scripts/classic/art.mjs). Animation sequencing follows the MIT-licensed desktopPet format by Adriano Tiger.</info>
    <application>1</application>
  </header>
  <image><tilesx>${COLUMNS}</tilesx><tilesy>${rows}</tilesy><skins>1</skins><png><![CDATA[${png}]]></png><transparency>None</transparency></image>
  <spawns>
${structure.spawns.map(spawn).join('\n')}
  </spawns>
  <animations>
${structure.animations.map(anim).join('\n')}
  </animations>
</animations>
`;
};

/** Contact sheet (every tile, 3x) for eyeballing the art. */
export const contactSheet = () => {
  const names = [...new Set(structure.animations.flatMap((a) => a.frames))];
  const rows = Math.ceil(names.length / COLUMNS);
  const sheet = canvas(COLUMNS * TILE, rows * TILE);
  names.forEach((n, i) =>
    blit(sheet, drawPose(n), (i % COLUMNS) * TILE, Math.floor(i / COLUMNS) * TILE),
  );
  return encodePng(sheet.w, sheet.h, sheet.buf);
};
