/**
 * Pure helpers behind `npm run release`: work out the next version and decide whether the repository
 * is in a fit state to release. The script around them (scripts/release.mts) is only git plumbing.
 */

export type Bump = 'patch' | 'minor' | 'major';

export const parseBump = (arg: string | undefined): Bump | null =>
  arg === 'patch' || arg === 'minor' || arg === 'major' ? arg : null;

const PLAIN = /^(\d+)\.(\d+)\.(\d+)$/;

/** The next version after `version` (plain x.y.z only: pre-release suffixes are not supported). */
export const bump = (version: string, kind: Bump): string => {
  const m = PLAIN.exec(version);
  if (!m) throw new Error(`cannot bump "${version}": expected a plain x.y.z version`);
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

export interface RepoState {
  readonly branch: string;
  /** `git status --porcelain` is empty. */
  readonly clean: boolean;
  /** Commits on origin/main that we do not have. */
  readonly behind: number;
  /** Commits we have that origin/main does not (they would be released too, so they must be pushed). */
  readonly ahead: number;
  /** CI succeeded on HEAD: true / false, or null if it could not be determined. */
  readonly ciGreen: boolean | null;
}

/** Everything that stands in the way of a release, in plain words (empty means go). */
export const problems = (s: RepoState): string[] => [
  ...(s.branch !== 'main' ? [`you are on "${s.branch}": releases are cut from main`] : []),
  ...(!s.clean ? ['the working tree has uncommitted changes: commit or stash them first'] : []),
  ...(s.behind > 0 ? [`main is ${s.behind} commit(s) behind origin: pull first`] : []),
  ...(s.ahead > 0
    ? [`main is ${s.ahead} commit(s) ahead of origin: push them (and let CI pass) first`]
    : []),
  ...(s.ciGreen === false ? ['CI has not passed on this commit yet'] : []),
];
