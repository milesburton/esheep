import { describe, expect, it } from 'vitest';
import { bump, parseBump, problems, type RepoState } from './release.mjs';

describe('bump', () => {
  it.each([
    ['0.1.2', 'patch', '0.1.3'],
    ['0.1.2', 'minor', '0.2.0'],
    ['0.1.2', 'major', '1.0.0'],
    ['1.9.9', 'patch', '1.9.10'],
    ['1.9.9', 'minor', '1.10.0'],
    ['9.9.9', 'major', '10.0.0'],
    ['0.0.0', 'patch', '0.0.1'],
  ] as const)('%s + %s = %s', (from, kind, to) => {
    expect(bump(from, kind)).toBe(to);
  });

  it.each(['1.2', '1.2.3-beta.1', 'v1.2.3', '', 'x.y.z', '1.2.3.4'])(
    'refuses "%s" (not a plain x.y.z version)',
    (v) => {
      expect(() => bump(v, 'patch')).toThrow(/plain x\.y\.z/);
    },
  );
});

describe('parseBump', () => {
  it('accepts exactly patch, minor and major', () => {
    expect(parseBump('patch')).toBe('patch');
    expect(parseBump('minor')).toBe('minor');
    expect(parseBump('major')).toBe('major');
    for (const bad of [undefined, '', 'Patch', 'prerelease', '1.2.3'])
      expect(parseBump(bad)).toBeNull();
  });
});

describe('problems', () => {
  const ok: RepoState = { branch: 'main', clean: true, behind: 0, ahead: 0, ciGreen: true };

  it('is empty when the repository is ready', () => {
    expect(problems(ok)).toEqual([]);
  });

  it('does not block when CI status could not be determined (the pipeline checks it again anyway)', () => {
    expect(problems({ ...ok, ciGreen: null })).toEqual([]);
  });

  it('names every problem in words', () => {
    expect(problems({ ...ok, branch: 'feature/x' })[0]).toMatch(/feature\/x.*main/);
    expect(problems({ ...ok, clean: false })[0]).toMatch(/uncommitted/);
    expect(problems({ ...ok, behind: 2 })[0]).toMatch(/2 commit.*behind.*pull/);
    expect(problems({ ...ok, ahead: 1 })[0]).toMatch(/1 commit.*ahead.*push/);
    expect(problems({ ...ok, ciGreen: false })[0]).toMatch(/CI has not passed/);
  });

  it('reports several at once', () => {
    expect(
      problems({ branch: 'dev', clean: false, behind: 1, ahead: 1, ciGreen: false }),
    ).toHaveLength(5);
  });
});
