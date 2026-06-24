import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, symlinkSync, lstatSync, readlinkSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ALLOWLIST, SYMLINKS, RENAMES, ensureSymlink } from './update-skateboard.js';

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
