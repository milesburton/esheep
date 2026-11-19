// Re-downloads the classic eSheep ("esheep64") pack from Adrianotiger/desktopPet into
// assets/packs/original. The pack is committed to this repo (see NOTICE.md there); use this to refresh it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

const URL =
  'https://raw.githubusercontent.com/Adrianotiger/desktopPet/master/Pets/esheep64/animations.xml';
const dest = path.join(__dirname, '..', 'assets', 'packs', 'original');

(async () => {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'animations.xml'), Buffer.from(await res.arrayBuffer()));
  console.log(`Saved ${path.join(dest, 'animations.xml')}\nChoose "original" in Settings.`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
