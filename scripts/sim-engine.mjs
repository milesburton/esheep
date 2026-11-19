// Headless soak test of the classic engine against a pack (default: the original, if fetched).
// Usage: node scripts/sim-engine.mjs [packName] [simulatedMinutes] [runs]
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilePack, spawn, update } from '../dist/web/core/engine.js';
import { nextRandom } from '../dist/web/core/rng.js';

const root = path.join(fileURLToPath(new URL('.', import.meta.url)), '..');
const { parsePackXml } = createRequire(import.meta.url)('../dist/main/pack.js');
const [name = 'woolly', minutes = '30', runs = '60'] = process.argv.slice(2);
const xml = path.join(root, 'assets', 'packs', name, 'animations.xml');
if (!fs.existsSync(xml)) {
  console.error(`no pack at ${xml} (npm run fetch-original for the original)`);
  process.exit(1);
}

const pack = parsePackXml(fs.readFileSync(xml, 'utf8'), name);
const cp = compilePack(pack);
const tile = 64;
const cfg = { size: tile * 2, scale: 2 };
// Two side-by-side monitors plus a window floating on the left one.
const world = {
  areas: [
    { x: 0, y: 0, width: 1920, height: 1040 },
    { x: 1920, y: 0, width: 1920, height: 1040 },
  ],
  windows: [{ x: 300, y: 500, width: 600, height: 400 }],
};

const seen = new Map();
let bad = 0;
let seed = 12345;
const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
const perRunMs = (Number(minutes) * 60_000) / Number(runs);
for (let run = 0; run < Number(runs); run++) {
  [, seed] = nextRandom(seed);
  let u = spawn(cp, world, cfg, seed);
  let s = u.state;
  for (const n of u.started) seen.set(n, (seen.get(n) ?? 0) + 1);
  for (let t = 0; t < perRunMs; t += 16) {
    u = update(cp, s, world, cfg, 16);
    s = u.state;
    for (const n of u.started) seen.set(n, (seen.get(n) ?? 0) + 1);
    if (![s.x, s.y, s.frame].every(Number.isFinite)) bad++;
    bounds.minX = Math.min(bounds.minX, s.x);
    bounds.maxX = Math.max(bounds.maxX, s.x);
    bounds.minY = Math.min(bounds.minY, s.y);
    bounds.maxY = Math.max(bounds.maxY, s.y);
  }
}
const r = (n) => Math.round(n);
console.log(`${pack.animations.length} animations, ${pack.spawns.length} spawns`);
console.log(
  `simulated ${minutes} min; x ${r(bounds.minX)}..${r(bounds.maxX)}, y ${r(bounds.minY)}..${r(bounds.maxY)}; non-finite: ${bad}`,
);
console.log(
  'played:',
  [...seen]
    .sort((a, b) => b[1] - a[1])
    .map(([n, c]) => `${n}x${c}`)
    .join(', '),
);
console.log(
  'never played:',
  pack.animations
    .map((a) => a.name)
    .filter((n) => !seen.has(n))
    .join(', ') || '(none)',
);
process.exit(bad ? 1 : 0);
