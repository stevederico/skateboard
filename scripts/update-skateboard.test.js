import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, symlinkSync, lstatSync, readlinkSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { ALLOWLIST, SYMLINKS, RENAMES, ensureSymlink } from './update-skateboard.js';

const REPO = fileURLToPath(new URL('..', import.meta.url));
function walkRepo(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'databases' || name === 'dist') continue;
    const full = join(dir, name);
    // lstat (not stat): never follow symlinks. A symlinked backend/.env pointing at an
    // absent DefaultEnv would make statSync throw ENOENT and crash the whole suite. A
    // symlink is never template-owned boilerplate to allowlist anyway — skip it.
    const st = lstatSync(full);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walkRepo(full, out);
    else out.push(full.slice(REPO.length));
  }
  return out;
}

// Regression guard for the 4.5.0 omission: the updater REFERENCED new boilerplate
// (backend/lib/*, vite.plugins.ts, src/test/setup.js) but they were absent from the
// ALLOWLIST, so `node scripts/update-skateboard.js` left apps with a broken build —
// imports resolved to nothing. The invariant below makes a new backend file fail CI
// unless it is allowlisted (or explicitly runtime/vendor).
// This suite guards the TEMPLATE's own allowlist. It ships to apps (the test file is
// allowlisted) but must NOT run there — an app legitimately has non-allowlisted backend
// files (custom routes/services), which would false-fail. Run only in the skateboard repo.
const IS_TEMPLATE = (() => {
  try { return JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).name === 'skateboard'; }
  catch { return false; }
})();
describe('ALLOWLIST completeness', { skip: !IS_TEMPLATE }, () => {
  it('every ALLOWLIST entry exists in the repo', () => {
    const missing = ALLOWLIST.filter(f => !existsSync(join(REPO, f)));
    assert.deepEqual(missing, [], `ALLOWLIST references missing files: ${missing.join(', ')}`);
  });

  it('every backend boilerplate code file (.ts / .js) is allowlisted', () => {
    // backend/ code is template-owned; vendor/ is covered by explicit entries, databases/
    // is runtime data. Covers .ts AND .js (incl. .test.js). NOT .json: backend/config.json
    // is app-owned (each app's db config) and correctly stays off the allowlist.
    const missing = walkRepo(join(REPO, 'backend'))
      .filter(f => (f.endsWith('.ts') || f.endsWith('.js')) && !f.includes('/vendor/'))
      .filter(f => !ALLOWLIST.includes(f));
    assert.deepEqual(missing, [], `backend boilerplate missing from ALLOWLIST: ${missing.join(', ')}`);
  });

  it('allowlists the build/test infra new in 4.5.0', () => {
    for (const f of ['vite.plugins.ts', 'src/test/setup.js']) {
      assert.ok(ALLOWLIST.includes(f), `${f} must be synced or apps fail to build/test`);
    }
  });
});

// Regression guard for the CLAUDE.md → AGENTS.md symlink flip. The bug: CLAUDE.md was a
// regular allowlisted file, but once it became a symlink, `git show HEAD:CLAUDE.md` serves
// the 9-byte target string "AGENTS.md", which the updater would write over an app's real
// CLAUDE.md. Fix = allowlist AGENTS.md (content) + materialize CLAUDE.md as a symlink.
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
