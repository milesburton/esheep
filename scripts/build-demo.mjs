// Assembles the GitHub Pages site into dist/demo from the compiled web build.
// Only redistributable art is included: the generated "woolly" pack and the bounce strip.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { parsePackXml } = require('../dist/main/pack.js');

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

const woolly = parsePackXml(readFileSync('assets/packs/woolly/animations.xml', 'utf8'), 'woolly');
writeFileSync(join(out, 'packs', 'woolly.json'), JSON.stringify(woolly));
cpSync('assets/sheep.png', join(out, 'assets', 'sheep.png'));
console.log(`demo site written to ${out}`);
