import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync, lstatSync, readlinkSync, readFileSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { ALLOWLIST, REMOVED, SYMLINKS, RENAMES, TMP_DIR, ensureSymlink, filesToResolve, findMergeDefects, hooksPathWarning, mergeTempFile, threeWayMerge } from './update-skateboard.js';

const REPO = fileURLToPath(new URL('..', import.meta.url));
function walkRepo(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'databases' || name === 'dist' || name === 'target') continue;
    const full = join(dir, name);
    const st = lstatSync(full);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walkRepo(full, out);
    else out.push(full.slice(REPO.length));
  }
  return out;
}

const IS_TEMPLATE = (() => {
  try { return JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).name === 'skateboard'; }
  catch { return false; }
})();
describe('ALLOWLIST completeness', { skip: !IS_TEMPLATE }, () => {
  it('every ALLOWLIST entry exists in the repo', () => {
    const missing = ALLOWLIST.filter(f => !existsSync(join(REPO, f)));
    assert.deepEqual(missing, [], `ALLOWLIST references missing files: ${missing.join(', ')}`);
  });

  it('every backend boilerplate file is allowlisted', () => {
    const missing = walkRepo(join(REPO, 'backend'))
      .filter(f => !f.includes('/databases/') && !f.endsWith('config.json') && !f.includes('.env') && !f.endsWith('.DS_Store'))
      .filter(f => !ALLOWLIST.includes(f));
    assert.deepEqual(missing, [], `backend boilerplate missing from ALLOWLIST: ${missing.join(', ')}`);
  });

  it('every guardrails file is allowlisted', () => {
    const missing = ['eslint-plugin', 'verify']
      .flatMap(dir => walkRepo(join(REPO, 'guardrails', dir)))
      .filter(f => !f.endsWith('.DS_Store'))
      .filter(f => f !== 'guardrails/verify/flows.sh')
      .filter(f => !ALLOWLIST.includes(f));
    assert.ok(!ALLOWLIST.includes('guardrails/verify/flows.sh'), 'flows.sh asserts template views; apps own theirs');
    assert.ok(ALLOWLIST.includes('guardrails/verify/app.sh'), 'app.sh must be synced');
    assert.deepEqual(missing, [], `guardrails files missing from ALLOWLIST: ${missing.join(', ')}`);
    for (const f of ['.oxlintrc.json', '.dependency-cruiser.js', 'guardrails/package.json', 'guardrails/package-lock.json']) {
      assert.ok(ALLOWLIST.includes(f), `${f} must be synced`);
    }
  });

  it('allowlists the build infra new in 4.5.0', () => {
    assert.ok(ALLOWLIST.includes('vite.plugins.ts'), 'vite.plugins.ts must be synced');
  });

  it('drops the Node verify files from apps; the bash app.sh replaces them (5.29.0)', () => {
    for (const f of ['paths.js', 'browser.js', 'servers.js', 'smoke.e2e.js', 'ports.e2e.js', 'verify.e2e.js'].map(f => `guardrails/verify/${f}`)) {
      assert.ok(REMOVED.includes(f), `${f} must be removed`);
      assert.ok(!ALLOWLIST.includes(f), `${f} must not be synced`);
    }
  });

  it('drops ESLint, Playwright and require-jsdoc-on-exports from apps (5.23.0)', () => {
    for (const f of ['eslint.config.js', 'guardrails/verify/playwright.config.js', 'guardrails/eslint-plugin/rules/require-jsdoc-on-exports.js']) {
      assert.ok(REMOVED.includes(f), `${f} must be removed`);
      assert.ok(!ALLOWLIST.includes(f), `${f} must not be synced`);
    }
  });

  it('drops the old vitest harness from apps', () => {
    assert.ok(REMOVED.includes('src/test/setup.js'));
    assert.ok(REMOVED.includes('src/test/dom.js'));
  });
});

describe('updater instruction-file config', () => {
  it('allowlists AGENTS.md (the real content file)', () => {
    assert.ok(ALLOWLIST.includes('AGENTS.md'), 'AGENTS.md must be synced so apps get the guidance');
  });

  it('does NOT allowlist CLAUDE.md (it is a symlink, not content)', () => {
    assert.ok(!ALLOWLIST.includes('CLAUDE.md'), 'CLAUDE.md must not be copied as a file — git serves its target string');
  });

  it('declares CLAUDE.md as a symlink to AGENTS.md', () => {
    assert.equal(SYMLINKS['CLAUDE.md'], 'AGENTS.md');
  });

  it('migrates a legacy real CLAUDE.md into AGENTS.md via RENAMES', () => {
    assert.equal(RENAMES['AGENTS.md'], 'CLAUDE.md');
  });
});

describe('ensureSymlink', () => {
  let root;
  const yes = async () => true;
  const no = async () => false;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sk-symlink-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('creates the symlink when absent and target exists', async () => {
    writeFileSync(join(root, 'AGENTS.md'), 'guidance');
    const status = await ensureSymlink('CLAUDE.md', 'AGENTS.md', { root });
    assert.equal(status, 'wrote');
    assert.ok(lstatSync(join(root, 'CLAUDE.md')).isSymbolicLink());
    assert.equal(readlinkSync(join(root, 'CLAUDE.md')), 'AGENTS.md');
  });

  it('is idempotent when the symlink already points at the target', async () => {
    writeFileSync(join(root, 'AGENTS.md'), 'guidance');
    symlinkSync('AGENTS.md', join(root, 'CLAUDE.md'));
    const status = await ensureSymlink('CLAUDE.md', 'AGENTS.md', { root });
    assert.equal(status, 'ok');
    assert.equal(readlinkSync(join(root, 'CLAUDE.md')), 'AGENTS.md');
  });

  it('retargets a symlink that points somewhere else', async () => {
    writeFileSync(join(root, 'AGENTS.md'), 'guidance');
    symlinkSync('WRONG.md', join(root, 'CLAUDE.md'));
    const status = await ensureSymlink('CLAUDE.md', 'AGENTS.md', { root });
    assert.equal(status, 'wrote');
    assert.equal(readlinkSync(join(root, 'CLAUDE.md')), 'AGENTS.md');
  });

  it('replaces a legacy regular file when confirmed, without touching the target', async () => {
    writeFileSync(join(root, 'AGENTS.md'), 'guidance');
    writeFileSync(join(root, 'CLAUDE.md'), 'old project rules');
    const status = await ensureSymlink('CLAUDE.md', 'AGENTS.md', { root, confirmFn: yes });
    assert.equal(status, 'wrote');
    assert.ok(lstatSync(join(root, 'CLAUDE.md')).isSymbolicLink());
    assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), 'guidance');
  });

  it('keeps a regular file when the user declines', async () => {
    writeFileSync(join(root, 'AGENTS.md'), 'guidance');
    writeFileSync(join(root, 'CLAUDE.md'), 'old project rules');
    const status = await ensureSymlink('CLAUDE.md', 'AGENTS.md', { root, confirmFn: no });
    assert.equal(status, 'declined');
    assert.ok(lstatSync(join(root, 'CLAUDE.md')).isFile());
    assert.equal(readFileSync(join(root, 'CLAUDE.md'), 'utf8'), 'old project rules');
  });

  it('skips when the target does not exist (no dangling link)', async () => {
    const status = await ensureSymlink('CLAUDE.md', 'AGENTS.md', { root });
    assert.equal(status, 'ok');
    assert.ok(!existsSync(join(root, 'CLAUDE.md')));
  });
});

describe('REMOVED', () => {
  it('drops stale ambient declaration copies that would shadow real types', () => {
    for (const f of ['backend/ambient.d.ts', 'src/skateboard-ui.d.ts']) {
      assert.ok(REMOVED.includes(f), `${f} must be removed from apps`);
      assert.ok(!ALLOWLIST.includes(f), `${f} must not be synced back`);
    }
  });
});

describe('per-process temp paths', () => {
  it('scopes the clone dir and merge temp files to this process', () => {
    assert.ok(TMP_DIR.endsWith(`-${process.pid}`), TMP_DIR);
    const roles = ['cur', 'base', 'new'].map(mergeTempFile);
    for (const p of roles) assert.ok(p.includes(`.${process.pid}.`), p);
    assert.equal(new Set(roles).size, 3);
  });
});

describe('filesToResolve', () => {
  it('keeps conflicted, declined and errored files in order and drops the rest', () => {
    const results = [
      { relPath: 'a.rs', status: 'wrote' },
      { relPath: 'b.rs', status: 'conflicts' },
      { relPath: 'c.ts', status: 'ok' },
      { relPath: 'd.ts', status: 'declined' },
      { relPath: 'e.bin', status: 'error' }
    ];
    assert.deepEqual(filesToResolve(results).map(({ relPath }) => relPath), ['b.rs', 'd.ts', 'e.bin']);
  });
});

describe('postinstall hooksPath', () => {
  let root;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sk-hooks-'));
    git(root, 'init', '-q');
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const runPostinstall = (env) => spawnSync('sh', ['-c', TEMPLATE_POSTINSTALL], { cwd: root, env, encoding: 'utf8' });
  const localHooksPath = (env) => spawnSync('git', ['config', '--local', 'core.hooksPath'], { cwd: root, env, encoding: 'utf8' }).stdout.trim();

  it('is the postinstall the template ships', { skip: !IS_TEMPLATE }, () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(pkg.scripts.postinstall, TEMPLATE_POSTINSTALL);
  });

  it('sets .githooks when no hooksPath is configured at any level', () => {
    const env = isolatedGitEnv(root);
    assert.equal(runPostinstall(env).status, 0);
    assert.equal(localHooksPath(env), '.githooks');
  });

  it('leaves a global hooksPath in charge and sets no local one', () => {
    const env = isolatedGitEnv(root, '[core]\n\thooksPath = /opt/factory/hooks\n');
    assert.equal(runPostinstall(env).status, 0);
    assert.equal(localHooksPath(env), '');
  });

  it('succeeds outside a git repository', () => {
    const outside = mkdtempSync(join(tmpdir(), 'sk-nogit-'));
    const run = spawnSync('sh', ['-c', TEMPLATE_POSTINSTALL], { cwd: outside, env: { ...isolatedGitEnv(root), GIT_CEILING_DIRECTORIES: tmpdir() }, encoding: 'utf8' });
    rmSync(outside, { recursive: true, force: true });
    assert.equal(run.status, 0);
  });
});

describe('hooksPathWarning', () => {
  it('says the postinstall defers to an existing hooksPath', () => {
    const warning = hooksPathWarning({ postinstall: TEMPLATE_POSTINSTALL, existingHooks: ['pre-commit'], hooksPath: '/opt/factory/hooks' });
    assert.match(warning, /core\.hooksPath is already \/opt\/factory\/hooks, so the postinstall leaves it alone/);
  });

  it('warns that .git/hooks get bypassed when no hooksPath is set', () => {
    const warning = hooksPathWarning({ postinstall: TEMPLATE_POSTINSTALL, existingHooks: ['pre-commit'], hooksPath: null });
    assert.match(warning, /existing git hook\(s\) in \.git\/hooks \(pre-commit\) — no core\.hooksPath is set/);
  });

  it('stays quiet when nothing would be bypassed or the postinstall is unchanged', () => {
    assert.equal(hooksPathWarning({ postinstall: TEMPLATE_POSTINSTALL, existingHooks: [], hooksPath: null }), null);
    assert.equal(hooksPathWarning({ postinstall: null, existingHooks: ['pre-commit'], hooksPath: null }), null);
  });
});

describe('findMergeDefects', () => {
  it('flags a duplicate declaration that a clean 3-way merge produced', () => {
    const base = 'export function keep() {}\n\nexport function other() {}\n';
    const app = `export function helper() {}\n\n${base}`;
    const incoming = `${base}\nexport function helper() {}\n`;
    const { merged, conflicts } = threeWayMerge(app, base, incoming);
    assert.equal(conflicts, 0);
    assert.deepEqual(findMergeDefects(merged, 'vite.plugins.ts'), [
      'duplicate top-level declaration "helper" (2×) — likely TS2393'
    ]);
  });
});

const UPDATER = fileURLToPath(new URL('./update-skateboard.js', import.meta.url));
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, stdio: 'pipe' });

function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
}

function tagRelease(repo, version, files) {
  writeTree(repo, files);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', version);
  git(repo, 'tag', version);
}

const TEMPLATE_POSTINSTALL = 'git config core.hooksPath >/dev/null 2>&1 || git config core.hooksPath .githooks || true';

function isolatedGitEnv(root, globalConfig = '') {
  const globalFile = join(root, 'global.gitconfig');
  writeFileSync(globalFile, globalConfig);
  return { ...process.env, GIT_CONFIG_GLOBAL: globalFile, GIT_CONFIG_NOSYSTEM: '1' };
}

const PLUGINS_V1 = 'export function keep() {}\n\nexport function other() {}\n';

function makeTemplate(root) {
  const repo = join(root, 'template');
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'master');
  tagRelease(repo, '1.0.0', {
    'package.json': JSON.stringify({ name: 'skateboard', version: '1.0.0', workspaces: ['backend'], scripts: {} }),
    'AGENTS.md': 'a\nb\nc\n',
    'vite.plugins.ts': PLUGINS_V1
  });
  tagRelease(repo, '2.0.0', {
    'package.json': JSON.stringify({ name: 'skateboard', version: '2.0.0', scripts: { postinstall: TEMPLATE_POSTINSTALL } }),
    'AGENTS.md': 'a\nB2\nc\n',
    'vite.plugins.ts': `${PLUGINS_V1}\nexport function helper() {}\n`
  });
  return repo;
}

function makeApp(root, pkg, files = {}) {
  const app = join(root, 'app');
  mkdirSync(app);
  writeTree(app, { 'package.json': JSON.stringify(pkg), 'vite.plugins.ts': PLUGINS_V1, ...files });
  return app;
}

function runUpdater(app, repo, ...args) {
  return spawnSync(process.execPath, [UPDATER, '--yes', ...args], {
    cwd: app,
    encoding: 'utf8',
    env: { ...isolatedGitEnv(dirname(app)), SKATEBOARD_REPO: repo, SKATEBOARD_BRANCH: '' }
  });
}

const readPkg = (app) => JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));

describe('updater main against a local template', () => {
  let root;
  let repo;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sk-updater-'));
    repo = makeTemplate(root);
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('drops the workspaces entry, deletes stale ambient types and warns about hooks the postinstall bypasses', () => {
    const app = makeApp(root, { name: 'app', skateboardVersion: '1.0.0', workspaces: ['backend'], scripts: {} }, {
      'AGENTS.md': 'a\nb\nc\n',
      '.git/hooks/pre-commit': '#!/bin/sh\n',
      'backend/ambient.d.ts': 'declare module "pg";\n',
      'src/skateboard-ui.d.ts': 'declare module "x";\n'
    });
    const run = runUpdater(app, repo);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const pkg = readPkg(app);
    assert.equal(pkg.workspaces, undefined);
    assert.equal(pkg.skateboardVersion, '2.0.0');
    assert.match(run.stdout, /existing git hook\(s\) in \.git\/hooks \(pre-commit\)/);
    assert.ok(!existsSync(join(app, 'backend/ambient.d.ts')));
    assert.ok(!existsSync(join(app, 'src/skateboard-ui.d.ts')));
    assert.equal(readFileSync(join(app, 'AGENTS.md'), 'utf8'), 'a\nB2\nc\n');
  });

  it('stamps the version, lists the file and exits 1 when a clean merge ships a duplicate declaration', () => {
    const app = makeApp(root, { name: 'app', skateboardVersion: '1.0.0', scripts: {} }, {
      'AGENTS.md': 'a\nb\nc\n',
      'vite.plugins.ts': `export function helper() {}\n\n${PLUGINS_V1}`
    });
    const run = runUpdater(app, repo);
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(run.stdout, /DEFECT/);
    assert.match(run.stdout, /still need a hand fix:\n {2}vite\.plugins\.ts {2}\(conflict markers or merge defects to fix\)/);
    assert.equal(readPkg(app).skateboardVersion, '2.0.0');
  });

  it('stamps the version, lists the conflicted file and exits 1 when a file conflicts', () => {
    const app = makeApp(root, { name: 'app', skateboardVersion: '1.0.0', scripts: {} }, { 'AGENTS.md': 'a\nmine\nc\n' });
    const run = runUpdater(app, repo);
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(run.stdout, /still need a hand fix:\n {2}AGENTS\.md {2}\(conflict markers or merge defects to fix\)/);
    assert.equal(readPkg(app).skateboardVersion, '2.0.0');
  });

  it('stops when already on latest, and --baseline forces a re-sync', () => {
    const app = makeApp(root, { name: 'app', skateboardVersion: '2.0.0', scripts: {} }, { 'AGENTS.md': 'a\nb\nc\n' });
    const idle = runUpdater(app, repo);
    assert.equal(idle.status, 0, idle.stdout + idle.stderr);
    assert.match(idle.stdout, /Already on latest/);
    assert.equal(readFileSync(join(app, 'AGENTS.md'), 'utf8'), 'a\nb\nc\n');

    const forced = runUpdater(app, repo, '--baseline', '1.0.0');
    assert.equal(forced.status, 0, forced.stdout + forced.stderr);
    assert.equal(readFileSync(join(app, 'AGENTS.md'), 'utf8'), 'a\nB2\nc\n');
  });

  it('migrates a stranded regular CLAUDE.md even when the version already matches', () => {
    const app = makeApp(root, { name: 'app', skateboardVersion: '2.0.0', scripts: {} }, { 'CLAUDE.md': 'old rules\n' });
    const run = runUpdater(app, repo);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /pre-rename file\(s\) remain/);
    assert.equal(readFileSync(join(app, 'AGENTS.md'), 'utf8'), 'a\nB2\nc\n');
    assert.equal(readlinkSync(join(app, 'CLAUDE.md')), 'AGENTS.md');
  });
});

function standaloneEnv() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

describe('template-only suites', () => {
  let app;
  beforeEach(() => {
    app = mkdtempSync(join(tmpdir(), 'sk-app-suites-'));
    mkdirSync(join(app, 'scripts'));
    for (const f of ['version-consistency.test.js', 'update-skateboard.test.js', 'update-skateboard.js']) {
      copyFileSync(join(REPO, 'scripts', f), join(app, 'scripts', f));
    }
    writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'my-app', type: 'module', version: '0.1.0', skateboardVersion: '9.9.9' }));
  });
  afterEach(() => {
    rmSync(app, { recursive: true, force: true });
  });

  it('skip in an app instead of failing on template-only files', () => {
    for (const args of [
      ['scripts/version-consistency.test.js'],
      ['--test-name-pattern=ALLOWLIST', 'scripts/update-skateboard.test.js']
    ]) {
      const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...args], { cwd: app, encoding: 'utf8', env: standaloneEnv() });
      assert.equal(run.status, 0, run.stdout + run.stderr);
      assert.match(run.stdout, /# fail 0/);
      assert.match(run.stdout, /# SKIP/);
    }
  });
});
