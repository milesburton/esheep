// Builds the "woolly" classic pack: a tile sheet of original art plus an animations.xml whose
// sequencing (timings, transitions, spawns) follows Adriano Tiger's MIT-licensed desktopPet format
// and its classic eSheep behaviour, recorded in structure.json with frames named by pose.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { drawPose, TILE } from './art.mjs';
import { blit, canvas, encodePng } from './png.mjs';

const COLUMNS = 16;
const original = JSON.parse(
  fs.readFileSync(fileURLToPath(new URL('./structure.json', import.meta.url)), 'utf8'),
);

/** Every interval is divided by this, so the whole sheep moves and animates faster. */
const TEMPO = 2;
/** Extra stride for the slow walking animations (the classic walk is only ~10 px/s). */
const WALK_BOOST = 3;
const WALKERS = new Set([
  'walk',
  'walk_win2',
  'walk_task2',
  'vertical_walk_up',
  'vertical_walk_down',
  'top_walk2',
]);

const numeric = /^-?\d+(\.\d+)?$/;
const scaled = (v, k) => (numeric.test(String(v)) ? String(Number(v) * k) : v);

/** Weight overrides: [animation, list, target id, only] -> new probability. */
const WEIGHTS = [
  // Climb the screen edges and walk the ceiling far more often than the classic 2%.
  ['walk', 'border', 37, 'vertical', 30],
  ['walk_win2', 'border', 37, 'vertical', 30],
  ['walk_task2', 'border', 37, 'vertical', 30],
  // Graze, wee, doze and sprint more often.
  ['rotate1b', 'next', 26, 'taskbar', 20],
  ['walk', 'next', 11, 'window', 10],
  ['walk', 'next', 15, 'none', 10],
  ['walk_win2', 'next', 17, 'none', 10],
  ['walk_win2', 'next', 19, 'none', 10],
  ['walk_task2', 'next', 17, 'none', 10],
  ['walk_task2', 'next', 19, 'none', 10],
  ['walk', 'next', 35, 'taskbar', 25],
  ['look_down', 'next', 44, 'none', 70],
];
/** Transitions the classic pack lacks entirely, so the rest of the sheet gets used. */
const EXTRA = [
  ['walk_task2', 'next', { p: 8, only: 'taskbar', id: 27 }], // grow a flower
  ['walk_task2', 'next', { p: 6, only: 'taskbar', id: 8 }], // boing
  ['walk', 'next', { p: 8, only: 'taskbar', id: 27 }],
  ['walk', 'next', { p: 6, only: 'taskbar', id: 8 }],
];
/** Spawn index -> weight: the bath and the black sheep walk-on turn up more often. */
const SPAWN_WEIGHTS = { 2: 8, 3: 6 };

const tune = (src) => {
  const anims = JSON.parse(JSON.stringify(src.animations)).map((a) => {
    const speed = (pt) => ({
      ...pt,
      x: WALKERS.has(a.name) ? scaled(pt.x, WALK_BOOST) : pt.x,
      y: WALKERS.has(a.name) ? scaled(pt.y, WALK_BOOST) : pt.y,
      interval: scaled(pt.interval, 1 / TEMPO),
    });
    return { ...a, start: speed(a.start), end: speed(a.end) };
  });
  for (const [name, list, id, only, p] of WEIGHTS)
    for (const n of anims.find((a) => a.name === name)?.[list] ?? [])
      if (n.id === id && n.only === only) n.p = p;
  for (const [name, list, n] of EXTRA) {
    const a = anims.find((x) => x.name === name);
    if (a && !a[list].some((e) => e.id === n.id && e.only === n.only)) a[list].push(n);
  }
  const spawns = src.spawns.map((s, i) => ({ ...s, p: SPAWN_WEIGHTS[i] ?? s.p }));
  return { animations: anims, spawns };
};
const structure = tune(original);

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
