// Regenerates the README metrics pills, screenshot gallery and docs/badges/*.json from the latest
// test, coverage and build output. Run after the test suites: `npm run readme`.
// Node strips the types at runtime (no extra transpiler), hence the explicit .ts import.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  endpointBadges,
  fromCoverage,
  fromPlaywright,
  fromVitest,
  renderPills,
  renderScreenshots,
  spliceBlock,
  type Metrics,
  type Shot,
} from '../src/tools/metrics.mts';

const REPO = process.env.GITHUB_REPOSITORY ?? 'milesburton/esheep';

const json = <T,>(file: string): T => {
  if (!existsSync(file))
    throw new Error(
      `missing ${file}: run the tests first (npm run test:coverage && npm run test:e2e)`,
    );
  return JSON.parse(readFileSync(file, 'utf8')) as T;
};

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const sourceLines = walk('src')
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'))
  .reduce(
    (n, f) =>
      n +
      readFileSync(f, 'utf8')
        .split('\n')
        .filter((l) => l.trim() !== '').length,
    0,
  );

const demoKb = existsSync('dist/demo')
  ? Math.round(walk('dist/demo').reduce((n, f) => n + statSync(f).size, 0) / 1024)
  : 0;

const metrics: Metrics = {
  ...fromVitest(json('reports/vitest.json')),
  ...fromPlaywright(json('reports/playwright.json')),
  ...fromCoverage(json('coverage/coverage-summary.json')),
  sourceLines,
  demoKb,
};

const captions: Record<string, Shot> = {
  'demo-walk.png': {
    file: '',
    alt: 'The woolly sheep walking along the bottom of a display, next to two windows',
    caption: 'The live demo: a sheep that walks, falls, sleeps and lands on windows.',
  },
  'demo-grab.png': {
    file: '',
    alt: 'The sheep held mid-air by the mouse pointer',
    caption: 'Grab the sheep with the mouse...',
  },
  'demo-dual.png': {
    file: '',
    alt: 'Two side-by-side monitors with the sheep on the right-hand one',
    caption: '...and it wanders across multiple monitors.',
  },
  'app-settings.png': {
    file: '',
    alt: 'The settings window with a speed slider, sprite pack picker and sound option',
    caption: "The desktop app's settings window.",
  },
};
const shots: Shot[] = Object.entries(captions)
  .filter(([name]) => existsSync(join('docs/screenshots', name)))
  .map(([name, s]) => ({ ...s, file: `docs/screenshots/${name}` }));

mkdirSync('docs/badges', { recursive: true });
for (const [name, badge] of Object.entries(endpointBadges(metrics))) {
  writeFileSync(join('docs/badges', `${name}.json`), `${JSON.stringify(badge, null, 2)}\n`);
}

const readme = readFileSync('README.md', 'utf8');
const updated = spliceBlock(
  spliceBlock(readme, 'metrics', renderPills(metrics, REPO)),
  'screenshots',
  renderScreenshots(shots),
);
writeFileSync('README.md', updated);
console.log('README updated:', JSON.stringify(metrics));
