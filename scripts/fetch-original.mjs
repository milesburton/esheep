// Downloads the classic eSheep ("esheep64") pack from Adrianotiger/desktopPet for LOCAL USE ONLY.
// The code of that project is MIT, but the sheep artwork is Tatsutoshi Nomura's / Fuji Television's
// character and has no clear licence. The pack lands in a git-ignored folder and is excluded from
// installers (see electron-builder.yml). Do not commit or redistribute it.
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
  console.log(
    `Saved ${path.join(dest, 'animations.xml')}\nPersonal use only - choose "original" in Settings.`,
  );
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
