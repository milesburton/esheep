// Copies non-TypeScript web files (HTML) next to the compiled JS.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

const root = path.join(__dirname, '..');
for (const dir of ['app', 'demo']) {
  const src = path.join(root, 'src', dir);
  const dest = path.join(root, 'dist', 'web', dir);
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(src).filter((n) => n.endsWith('.html'))) {
    fs.copyFileSync(path.join(src, f), path.join(dest, f));
  }
}

// The compiled web modules are ES modules; mark them so Node (sim, tests) can import them too.
fs.writeFileSync(path.join(root, 'dist', 'web', 'package.json'), '{"type":"module"}\n');
