// Assembles the GitHub Pages site into dist/demo from the compiled web build.
// Only redistributable art is included: the generated "woolly" pack and the bounce strip.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { parsePackXml } = require('../dist/main/pack.js');
const { tunePack } = require('../dist/main/tune.js');

const out = 'dist/demo';
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'packs'), { recursive: true });
mkdirSync(join(out, 'assets'), { recursive: true });
mkdirSync(join(out, 'demo'), { recursive: true });

const noMaps = (src) => !src.endsWith('.map');
for (const dir of ['core', 'web']) {
  cpSync(join('dist/web', dir), join(out, dir), { recursive: true, filter: noMaps });
}
// demo.js imports '../core/...' and '../web/...', so it lives one level down; the page is the site root.
cpSync('dist/web/demo/demo.js', join(out, 'demo', 'demo.js'));
writeFileSync(
  join(out, 'index.html'),
  readFileSync('dist/web/demo/index.html', 'utf8').replace('src="demo.js"', 'src="demo/demo.js"'),
);

const woolly = tunePack(
  parsePackXml(readFileSync('assets/packs/woolly/animations.xml', 'utf8'), 'woolly'),
);
writeFileSync(join(out, 'packs', 'woolly.json'), JSON.stringify(woolly));
const packs = ['woolly'];

// LOCAL USE ONLY: `--with-original` adds the (unlicensed) original eSheep art to your own build so
// you can see it in the demo. CI never passes this and the art is git-ignored, so it is never published.
if (process.argv.includes('--with-original')) {
  const file = 'assets/packs/original/animations.xml';
  if (!existsSync(file)) throw new Error('run `npm run fetch-original` first');
  const original = tunePack(parsePackXml(readFileSync(file, 'utf8'), 'original'));
  writeFileSync(join(out, 'packs', 'original.json'), JSON.stringify(original));
  packs.push('original');
  console.warn('WARNING: original eSheep art included. Do not publish this build.');
}
writeFileSync(join(out, 'packs', 'index.json'), JSON.stringify(packs));
cpSync('assets/sheep.png', join(out, 'assets', 'sheep.png'));
console.log(`demo site written to ${out}`);
