// `npm run release -- patch|minor|major`: bump the version, commit and push. Pushing is the whole
// release: when CI passes on that commit, the Release workflow builds and publishes it (see
// .github/workflows/release.yml). Pass --dry-run to see what would happen.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { bump, parseBump, problems } from '../src/tools/release.mts';

const sh = (cmd: string, args: string[]): string =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const kind = parseBump(args.find((a) => !a.startsWith('--')));
if (!kind) {
  console.error('usage: npm run release -- <patch|minor|major> [--dry-run]');
  process.exit(2);
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string };
sh('git', ['fetch', '--quiet']);
const head = sh('git', ['rev-parse', 'HEAD']);
// The README bot's commits carry [skip ci] and so never have a CI run; what matters is CI on the
// latest commit that does (the code it sits on).
const codeHead =
  sh('git', ['log', '--format=%H', '--fixed-strings', '--invert-grep', '--grep=[skip ci]', '-1']) ||
  head;
const [behind, ahead] = sh('git', ['rev-list', '--left-right', '--count', 'origin/main...HEAD'])
  .split(/\s+/)
  .map(Number);

const ciGreen = ((): boolean | null => {
  try {
    // Filter on `conclusion` in jq: the API's own `status=success` filter returns nothing even for a
    // run that succeeded.
    const n = sh('gh', [
      'api',
      `repos/{owner}/{repo}/actions/workflows/ci.yml/runs?head_sha=${codeHead}`,
      '--jq',
      '[.workflow_runs[] | select(.conclusion == "success" and .event == "push")] | length',
    ]);
    return Number(n) > 0;
  } catch {
    return null; // no gh, or no network: the Release workflow checks again before publishing
  }
})();

const next = bump(pkg.version, kind);
const stop = problems({
  branch: sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']),
  clean: sh('git', ['status', '--porcelain']) === '',
  behind,
  ahead,
  ciGreen,
});
if (stop.length > 0) {
  console.error(`Not releasing ${next}:\n${stop.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}

console.log(`${pkg.version} -> ${next} (${kind})`);
if (dry) {
  console.log('dry run: nothing changed');
  process.exit(0);
}
sh('npm', ['version', next, '--no-git-tag-version']);
sh('git', ['add', 'package.json', 'package-lock.json']);
sh('git', ['commit', '-m', `chore(release): ${next}`]);
sh('git', ['push']);
console.log(
  `Pushed v${next}. The Release workflow publishes it once CI is green:\n` +
    `  https://github.com/${sh('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])}/actions`,
);
