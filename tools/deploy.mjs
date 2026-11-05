// Publishes the site to GitHub Pages straight from this computer, with no GitHub Actions.
//
//   npm run deploy              checks, builds, and pushes the build to the `gh-pages` branch
//   npm run deploy -- --dry-run builds and shows what would be pushed, pushes nothing
//   npm run deploy -- --skip-checks   leaves out typecheck and unit tests (the build still runs)
//
// GitHub Pages must be set to "Deploy from a branch: gh-pages, / (root)" (Settings, Pages).
// The class inbox address and key are read from `.env.deploy.local` (git-ignored; they are public
// by design but kept out of the repository). Without that file the site is built with no inbox.
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const skipChecks = args.has('--skip-checks');
const BRANCH = 'gh-pages';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(cmd, cmdArgs, opts = {}) {
  return execFileSync(cmd, cmdArgs, {
    stdio: opts.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
    shell: process.platform === 'win32' && /\.cmd$/.test(cmd),
    ...opts,
  });
}
const git = (gitArgs, opts = {}) => run('git', gitArgs, { capture: true, ...opts }).trim();
const say = (m) => console.log(`\n== ${m}`);
function fail(m) {
  console.error(`\nDeploy stopped: ${m}`);
  process.exit(1);
}
// A dry run only warns about an unpushed or dirty tree, since it pushes nothing.
const guard = (m) => (dryRun ? console.warn(`Warning (dry run): ${m}`) : fail(m));

// 1. Deploy exactly what is committed and pushed, so the live site always matches `main`.
const remote = git(['remote', 'get-url', 'origin']);
const repo = (remote.match(/([^/:]+?)(?:\.git)?$/) ?? [])[1];
if (!repo) fail(`cannot read the repository name from ${remote}`);
if (git(['status', '--porcelain', '--untracked-files=no']) !== '') {
  guard('there are uncommitted changes. Commit them first, so the live site matches `main`.');
}
const head = git(['rev-parse', 'HEAD']);
git(['fetch', 'origin', 'main', '--quiet']);
if (git(['rev-parse', 'origin/main']) !== head) {
  guard(
    'HEAD is not the same as origin/main. Push (or pull) first, so the live site matches `main`.',
  );
}

// 2. Checks, then the production build with the Pages base path and the inbox settings.
if (!skipChecks) {
  say('Typecheck');
  run(npm, ['run', 'typecheck']);
  say('Unit tests');
  run(npm, ['test']);
}
say(`Build for /${repo}/`);
if (!existsSync('.env.deploy.local')) {
  console.warn('Note: .env.deploy.local is missing, so this build has no class inbox.');
}
rmSync('dist', { recursive: true, force: true });
run(npx, ['tsc', '--noEmit']);
run(npx, ['vite', 'build', '--mode', 'deploy'], {
  env: { ...process.env, BASE_PATH: `/${repo}/` },
});
const built = readFileSync('dist/index.html', 'utf8');
const assets = [...built.matchAll(/assets\/index-[\w-]+\.js/g)].map((m) => m[0]);
if (assets.length === 0) fail('dist/index.html has no main script; the build looks wrong.');

// 3. Put the build on top of the existing `gh-pages` history in a scratch clone (a normal,
// fast-forward push: nothing is ever force-pushed).
say(`Prepare the ${BRANCH} branch`);
const work = mkdtempSync(join(tmpdir(), 'hane-pages-'));
try {
  const inWork = (a, o = {}) => git(['-C', work, ...a], o);
  git(['init', '--quiet', work]);
  inWork(['remote', 'add', 'origin', remote]);
  inWork(['config', 'user.name', git(['config', 'user.name'])]);
  inWork(['config', 'user.email', git(['config', 'user.email'])]);
  inWork(['config', 'core.autocrlf', 'false']);
  const exists = inWork(['ls-remote', '--heads', 'origin', BRANCH]) !== '';
  if (exists) {
    inWork(['fetch', '--quiet', '--depth=1', 'origin', BRANCH]);
    inWork(['checkout', '--quiet', '-B', BRANCH, 'FETCH_HEAD']);
  } else {
    inWork(['checkout', '--quiet', '--orphan', BRANCH]);
  }
  for (const name of readdirSync(work)) {
    if (name !== '.git') rmSync(join(work, name), { recursive: true, force: true });
  }
  cpSync('dist', work, { recursive: true });
  writeFileSync(join(work, '.nojekyll'), ''); // serve files as they are, no Jekyll processing
  inWork(['add', '--all']);
  const changed = inWork(['status', '--porcelain']);
  if (changed === '') {
    say('Nothing changed: the branch already holds this build.');
  } else {
    console.log(changed.split('\n').slice(0, 12).join('\n'));
    if (dryRun) {
      say('Dry run: nothing pushed.');
      process.exit(0);
    }
    inWork(['commit', '--quiet', '-m', `Deploy ${head.slice(0, 7)}`]);
    say(`Push to ${BRANCH}`);
    inWork(['push', '--quiet', 'origin', `${BRANCH}:${BRANCH}`]);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

// 4. Wait until the live page serves this build (GitHub Pages needs a minute to publish).
const owner = (remote.match(/github\.com[/:]([^/]+)\//) ?? [])[1];
const url = `https://${owner}.github.io/${repo}/`;
say(`Waiting for ${url}`);
for (let i = 0; i < 40; i++) {
  try {
    const live = await (await fetch(`${url}?nocache=${Date.now()}`, { cache: 'no-store' })).text();
    if (assets.every((a) => live.includes(a))) {
      console.log(`Live now: ${url}`);
      process.exit(0);
    }
  } catch {
    // offline for a moment: try again
  }
  await new Promise((r) => setTimeout(r, 5000));
}
fail(
  `pushed, but ${url} does not show the new build yet. Check that Settings, Pages is set to ` +
    `"Deploy from a branch: ${BRANCH}", then run this again.`,
);
