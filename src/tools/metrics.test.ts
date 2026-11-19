import { describe, expect, it } from 'vitest';
import {
  colourFor,
  endpointBadges,
  fromCoverage,
  fromPlaywright,
  fromVitest,
  pct,
  pill,
  renderPills,
  renderScreenshots,
  shieldsEscape,
  spliceBlock,
  testColour,
  type Metrics,
} from './metrics.mjs';

const m: Metrics = {
  unitPassed: 128,
  unitTotal: 128,
  e2ePassed: 21,
  e2eTotal: 22,
  linesPct: 99.76,
  branchesPct: 82.1,
  sourceLines: 2345,
  demoKb: 120,
};

describe('colours', () => {
  it.each([
    [100, 'brightgreen'],
    [90, 'brightgreen'],
    [85, 'green'],
    [75, 'yellow'],
    [60, 'orange'],
    [10, 'red'],
  ])('%d%% is %s', (p, c) => expect(colourFor(p)).toBe(c));

  it('tests are green only when all pass', () => {
    expect(testColour(5, 5)).toBe('brightgreen');
    expect(testColour(4, 5)).toBe('orange');
    expect(testColour(0, 5)).toBe('red');
    expect(testColour(0, 0)).toBe('red');
  });
});

describe('shields helpers', () => {
  it('escapes dashes, underscores and spaces for the badge path', () => {
    expect(shieldsEscape('a-b_c d')).toBe('a--b__c_d');
    expect(shieldsEscape('99.8%')).toBe('99.8%25');
  });

  it('renders an image pill, optionally linked', () => {
    expect(pill('unit tests', '5 passing', 'green')).toBe(
      '![unit tests: 5 passing](https://img.shields.io/badge/unit_tests-5_passing-green)',
    );
    expect(pill('x', 'y', 'blue', 'https://example.com')).toMatch(
      /^\[!\[x: y\]\(.*\)\]\(https:\/\/example\.com\)$/,
    );
  });

  it('formats percentages to one decimal', () => {
    expect(pct(99.76)).toBe('99.8%');
  });
});

describe('renderPills', () => {
  const out = renderPills(m, 'milesburton/esheep');
  it('includes CI, licence, test, coverage, size and demo-link pills', () => {
    expect(out).toContain('actions/workflows/ci.yml/badge.svg');
    expect(out).toContain('licence-MIT');
    expect(out).toContain('unit_tests-128%2F128_passing-brightgreen');
    expect(out).toContain('e2e_tests-21%2F22_passing-orange');
    expect(out).toContain('line_coverage-99.8%25-brightgreen');
    expect(out).toContain('branch_coverage-82.1%25-green');
    expect(out).toContain('2%2C345_lines_TypeScript');
    expect(out).toContain('https://milesburton.github.io/esheep/');
  });
});

describe('renderScreenshots', () => {
  it('renders captioned figures', () => {
    const out = renderScreenshots([{ file: 'docs/screenshots/a.png', alt: 'A', caption: 'First' }]);
    expect(out).toContain('<img src="docs/screenshots/a.png" alt="A"');
    expect(out).toContain('<figcaption>First</figcaption>');
  });
});

describe('spliceBlock', () => {
  const doc = 'top\n<!-- m:start -->\nold\n<!-- m:end -->\nbottom';
  it('replaces only the marked block and is idempotent', () => {
    const once = spliceBlock(doc, 'm', 'new');
    expect(once).toBe('top\n<!-- m:start -->\n\nnew\n\n<!-- m:end -->\nbottom');
    expect(spliceBlock(once, 'm', 'new')).toBe(once);
  });
  it('throws when markers are missing or out of order', () => {
    expect(() => spliceBlock('nothing', 'm', 'x')).toThrow(/markers/);
    expect(() => spliceBlock('<!-- m:end -->\n<!-- m:start -->', 'm', 'x')).toThrow(/markers/);
  });
});

describe('report readers', () => {
  it('reads vitest, playwright (flaky counts as passing, skipped ignored) and coverage reports', () => {
    expect(fromVitest({ numTotalTests: 10, numPassedTests: 9 })).toEqual({
      unitPassed: 9,
      unitTotal: 10,
    });
    expect(
      fromPlaywright({ stats: { expected: 18, unexpected: 1, flaky: 2, skipped: 5 } }),
    ).toEqual({ e2ePassed: 20, e2eTotal: 21 });
    expect(fromPlaywright({ stats: { expected: 3, unexpected: 0 } })).toEqual({
      e2ePassed: 3,
      e2eTotal: 3,
    });
    expect(fromCoverage({ total: { lines: { pct: 91 }, branches: { pct: 80 } } })).toEqual({
      linesPct: 91,
      branchesPct: 80,
    });
  });

  it('builds shields endpoint badges', () => {
    const b = endpointBadges(m);
    expect(b['unit-tests']).toEqual({
      schemaVersion: 1,
      label: 'unit tests',
      message: '128/128 passing',
      color: 'brightgreen',
    });
    expect(b['e2e-tests'].color).toBe('orange');
    expect(b.coverage).toMatchObject({ message: '99.8%', color: 'brightgreen' });
  });
});
