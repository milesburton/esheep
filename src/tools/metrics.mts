/**
 * Pure helpers behind `npm run readme`: turn test/coverage reports into README pills and
 * shields.io endpoint badges, and splice generated blocks into the README between markers.
 */

export interface Metrics {
  readonly unitPassed: number;
  readonly unitTotal: number;
  readonly e2ePassed: number;
  readonly e2eTotal: number;
  readonly linesPct: number;
  readonly branchesPct: number;
  readonly sourceLines: number;
  readonly demoKb: number;
}

export interface Shot {
  readonly file: string;
  readonly alt: string;
  readonly caption: string;
}

export interface EndpointBadge {
  readonly schemaVersion: 1;
  readonly label: string;
  readonly message: string;
  readonly color: string;
}

export const colourFor = (pct: number): string =>
  pct >= 90
    ? 'brightgreen'
    : pct >= 80
      ? 'green'
      : pct >= 70
        ? 'yellow'
        : pct >= 50
          ? 'orange'
          : 'red';

/** Tests are green only when every one passed (and there is at least one). */
export const testColour = (passed: number, total: number): string =>
  total > 0 && passed === total ? 'brightgreen' : passed === 0 ? 'red' : 'orange';

/** Escape a path segment for a static shields.io badge: `-` and `_` are doubled, spaces become `_`. */
export const shieldsEscape = (s: string): string =>
  encodeURIComponent(s.replace(/-/g, '--').replace(/_/g, '__').replace(/ /g, '_'));

export const pill = (label: string, value: string, colour: string, link?: string): string => {
  const img = `![${label}: ${value}](https://img.shields.io/badge/${shieldsEscape(label)}-${shieldsEscape(value)}-${colour})`;
  return link ? `[${img}](${link})` : img;
};

export const pct = (n: number): string => `${n.toFixed(1)}%`;

export const renderPills = (m: Metrics, repo: string): string => {
  const ci = `https://github.com/${repo}/actions/workflows/ci.yml`;
  return [
    `[![CI](https://github.com/${repo}/actions/workflows/ci.yml/badge.svg?branch=main)](${ci})`,
    '[![Licence: MIT](https://img.shields.io/badge/licence-MIT-yellow.svg)](LICENSE)',
    pill(
      'unit tests',
      `${m.unitPassed}/${m.unitTotal} passing`,
      testColour(m.unitPassed, m.unitTotal),
      ci,
    ),
    pill(
      'e2e tests',
      `${m.e2ePassed}/${m.e2eTotal} passing`,
      testColour(m.e2ePassed, m.e2eTotal),
      ci,
    ),
    pill('line coverage', pct(m.linesPct), colourFor(m.linesPct), ci),
    pill('branch coverage', pct(m.branchesPct), colourFor(m.branchesPct), ci),
    pill('source', `${m.sourceLines.toLocaleString('en-GB')} lines TypeScript`, 'blue'),
    pill(
      'demo size',
      `${m.demoKb} kB`,
      'blue',
      `https://${repo.split('/')[0]}.github.io/${repo.split('/')[1]}/`,
    ),
  ].join('\n');
};

export const renderScreenshots = (shots: readonly Shot[]): string =>
  shots
    .map(
      (s) =>
        `<figure>\n  <img src="${s.file}" alt="${s.alt}" width="720" />\n  <figcaption>${s.caption}</figcaption>\n</figure>`,
    )
    .join('\n\n');

/** Replace everything between `<!-- name:start -->` and `<!-- name:end -->`. */
export const spliceBlock = (text: string, name: string, body: string): string => {
  const start = `<!-- ${name}:start -->`;
  const end = `<!-- ${name}:end -->`;
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a === -1 || b === -1 || b < a) throw new Error(`README is missing the ${name} markers`);
  // Blank lines around the body keep the output stable under Prettier.
  return `${text.slice(0, a + start.length)}\n\n${body}\n\n${text.slice(b)}`;
};

export const endpointBadges = (m: Metrics): Record<string, EndpointBadge> => ({
  'unit-tests': {
    schemaVersion: 1,
    label: 'unit tests',
    message: `${m.unitPassed}/${m.unitTotal} passing`,
    color: testColour(m.unitPassed, m.unitTotal),
  },
  'e2e-tests': {
    schemaVersion: 1,
    label: 'e2e tests',
    message: `${m.e2ePassed}/${m.e2eTotal} passing`,
    color: testColour(m.e2ePassed, m.e2eTotal),
  },
  coverage: {
    schemaVersion: 1,
    label: 'coverage',
    message: pct(m.linesPct),
    color: colourFor(m.linesPct),
  },
});

interface VitestReport {
  readonly numTotalTests: number;
  readonly numPassedTests: number;
}
interface PlaywrightReport {
  readonly stats: {
    readonly expected: number;
    readonly unexpected: number;
    readonly flaky?: number;
    readonly skipped?: number;
  };
}
interface CoverageSummary {
  readonly total: {
    readonly lines: { readonly pct: number };
    readonly branches: { readonly pct: number };
  };
}

export const fromVitest = (r: VitestReport): { unitPassed: number; unitTotal: number } => ({
  unitPassed: r.numPassedTests,
  unitTotal: r.numTotalTests,
});

/** Flaky tests passed on retry but still count as passing; skipped tests are not counted. */
export const fromPlaywright = (r: PlaywrightReport): { e2ePassed: number; e2eTotal: number } => {
  const passed = r.stats.expected + (r.stats.flaky ?? 0);
  return { e2ePassed: passed, e2eTotal: passed + r.stats.unexpected };
};

export const fromCoverage = (c: CoverageSummary): { linesPct: number; branchesPct: number } => ({
  linesPct: c.total.lines.pct,
  branchesPct: c.total.branches.pct,
});
