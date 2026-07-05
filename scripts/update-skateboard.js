#!/usr/bin/env node

/**
 * Update an app's skateboard boilerplate files to match the latest release.
 *
 * Uses the app's current `skateboardVersion` as a 3-way-merge BASELINE: it clones
 * skateboard (full history), reads the baseline files at the matching git tag, and
 * merges the template's baseline→latest changes onto the app's files with
 * `git merge-file`. This PRESERVES local edits and only surfaces real conflicts as
 * `<<<<<<<` markers — it never blindly overwrites a customized file.
 *
 * package.json is merged the same way: deps the template ADDED are added, deps the
 * template REMOVED are pruned, and template version bumps are applied only where the
 * app hadn't customized them — app-specific deps are left untouched.
 *
 * If the app's `skateboardVersion` has no matching tag (unknown/very old), there is no
 * baseline, so it falls back to the legacy behavior (overwrite-with-confirm for files,
 * add-only for deps) and warns that pruning/merging is unavailable.
 *
 * If any file ends declined, conflicted, or errored, `skateboardVersion` is NOT
 * stamped — a re-run (with `--baseline <old>`) can finish the job after resolving.
 * Passing `--baseline` also forces a re-sync even when `skateboardVersion` already
 * matches the latest release.
 *
 * Shows a diff for each change and requires confirmation before writing. Re-runnable;
 * safe to abort at any prompt.
 *
 * Template renames (e.g. the 3.8.0 JS→TS conversion) are handled via the RENAMES
 * map: the app's old-named file is 3-way merged against the old path at the
 * baseline tag and the new path at HEAD, written under the new name, and the old
 * file removed — so local edits survive the rename.
 *
 * Usage:
 *   node scripts/update-skateboard.js                   # interactive
 *   node scripts/update-skateboard.js --yes             # apply all without prompts
 *   node scripts/update-skateboard.js --baseline 3.7.0  # force the merge baseline
 *     (use when skateboardVersion was stamped without the files actually migrating)
 *
 * Env overrides (for testing): SKATEBOARD_REPO (clone URL/path), SKATEBOARD_BRANCH.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, chmodSync, readdirSync, lstatSync, readlinkSync, symlinkSync, unlinkSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const APP_ROOT = process.cwd();
// Per-process clone dir so concurrent fleet runs don't clobber each other's checkout.
const TMP_DIR = join(tmpdir(), `skateboard-update-${process.pid}`);
const REPO = process.env.SKATEBOARD_REPO || 'https://github.com/stevederico/skateboard.git';
const BRANCH = process.env.SKATEBOARD_BRANCH || '';

// Template-owned files (current names at HEAD). App-owned files (constants.json,
// components, config.json, .env, main.jsx) are never touched — see SKIP_NOTE.
const ALLOWLIST = [
  'backend/server.ts',
  'backend/server.test.ts',
  'backend/server.lifecycle.test.js',
  'backend/server.prod-import.test.js',
  'backend/adapters/manager.ts',
  'backend/adapters/manager.test.js',
  'backend/adapters/sqlite.ts',
  'backend/adapters/sqlite.test.js',
  'backend/adapters/postgres.ts',
  'backend/adapters/postgres.test.js',
  'backend/adapters/mongodb.ts',
  'backend/adapters/mongodb.test.js',
  'backend/lib/auth.ts',
  'backend/lib/auth.test.js',
  'backend/lib/env.ts',
  'backend/lib/env.test.js',
  'backend/lib/logger.ts',
  'backend/lib/logger.test.js',
  'backend/lib/store.ts',
  'backend/lib/store.test.js',
  'backend/lib/validation.ts',
  'backend/lib/validation.test.js',
  'backend/types.ts',
  'backend/tsconfig.json',
  'backend/vendor/legacy-bcrypt.js',
  'backend/vendor/legacy-bcrypt.d.ts',
  'backend/package.json',
  'tsconfig.json',
  'vite.config.ts',
  'vite.plugins.ts',
  'vite.plugins.test.js',
  'src/test/setup.js',
  'AGENTS.md',
  'Dockerfile',
  '.dockerignore',
  '.gitignore',
  '.githooks/pre-commit',
  'scripts/update-skateboard.js',
  'scripts/update-skateboard.test.js',
  'scripts/verify-ui-version.mjs',
  'scripts/verify-ui-version.ts',
  'scripts/verify-ui-version.test.js',
  'scripts/version-consistency.test.js'
];

// Template-owned symlinks: link path → target path (both relative to app root).
// CLAUDE.md is a symlink to AGENTS.md (the open-standard source of truth). It is NOT
// on the ALLOWLIST because `git show HEAD:CLAUDE.md` serves the symlink's TARGET STRING
// ("AGENTS.md"), not file content — syncing it as a regular file would overwrite the
// app's CLAUDE.md with the 9-byte string "AGENTS.md". ensureSymlink recreates the link.
const SYMLINKS = { 'CLAUDE.md': 'AGENTS.md' };

// Files the template deleted that apps should drop too. A stale copy is harmful
// (ambient declarations shadow the real types: backend/ambient.d.ts hid pg/mongodb
// driver types; src/skateboard-ui.d.ts would hide skateboard-ui's own .d.ts ≥3.10.0).
const REMOVED = [
  'backend/ambient.d.ts',
  'src/skateboard-ui.d.ts'
];

// Template renames: new path at HEAD → old path apps may still have. Apps with the
// old-named file get a 3-way merge across the rename (see migrateRenamedFile).
const RENAMES = {
  'backend/server.ts': 'backend/server.js',
  'backend/server.test.ts': 'backend/server.test.js',
  'backend/adapters/manager.ts': 'backend/adapters/manager.js',
  'backend/adapters/sqlite.ts': 'backend/adapters/sqlite.js',
  'backend/adapters/postgres.ts': 'backend/adapters/postgres.js',
  'backend/adapters/mongodb.ts': 'backend/adapters/mongodb.js',
  'vite.config.ts': 'vite.config.js',
  // The instruction file flipped from CLAUDE.md (real file) to AGENTS.md (real file)
  // + CLAUDE.md symlink. An app whose CLAUDE.md is still a regular file gets its edits
  // 3-way merged into AGENTS.md; SYMLINKS then recreates CLAUDE.md as the symlink.
  'AGENTS.md': 'CLAUDE.md'
};

const SKIP_NOTE = `
Files NOT updated (app-owned — port manually if needed):
  - src/constants.json
  - src/main.jsx           (your routes — stays .jsx; Vite handles mixed JS/TS)
  - src/components/*       (your components)
  - src/assets/styles.css  (your theme overrides)
  - backend/config.json
  - backend/.env*
(exception: src/skateboard-ui.d.ts is template-owned type scaffolding)
`;

const yes = process.argv.includes('--yes') || process.argv.includes('-y');
const baselineArg = (() => {
  const i = process.argv.indexOf('--baseline');
  return i !== -1 ? process.argv[i + 1] : null;
})();

/** Full clone (not shallow) so baseline version tags are available for 3-way merge. */
function fetchSkateboard() {
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
  console.log('Fetching skateboard (full history for 3-way merge)...');
  execSync(`git clone ${BRANCH ? `--branch ${BRANCH} ` : ''}${REPO} ${TMP_DIR}`, { stdio: 'pipe' });
}

function readJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJSON(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

async function confirm(prompt) {
  if (yes) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ans = await rl.question(`${prompt} [y/N] `);
  rl.close();
  return ans.trim().toLowerCase().startsWith('y');
}

/** True if `version` exists as a git tag in the cloned template. */
function resolveBaselineTag(version) {
  if (!version || version === 'unknown') return null;
  try {
    const tags = execSync(`git -C ${TMP_DIR} tag -l`, { encoding: 'utf8' })
      .split('\n').map(s => s.trim());
    return tags.includes(version) ? version : null;
  } catch {
    return null;
  }
}

/** Contents of a file at a git ref in the cloned template, or null if absent there. */
function showAtRef(ref, relPath) {
  try {
    return execSync(`git -C ${TMP_DIR} show ${ref}:${relPath}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

/** Print a unified diff between two strings (current → incoming), truncated. */
function showDiff(curContent, incomingContent, label) {
  const a = join(tmpdir(), 'sk-cur.tmp');
  const b = join(tmpdir(), 'sk-inc.tmp');
  writeFileSync(a, curContent);
  writeFileSync(b, incomingContent);
  try {
    execSync(`diff -u "${a}" "${b}" | head -60`, { stdio: 'inherit' });
  } catch {
    // diff exits 1 when files differ — expected
  }
  rmSync(a, { force: true });
  rmSync(b, { force: true });
}

/**
 * Write a synced template file into the app, creating parent dirs as needed.
 * Files under `.githooks/` are chmod'd 0o755 — `writeFileSync` alone leaves them
 * non-executable and git silently skips non-executable hooks.
 */
function writeSynced(dst, relPath, content) {
  mkdirSync(dirname(dst), { recursive: true });
  writeFileSync(dst, content);
  if (relPath.startsWith('.githooks/')) chmodSync(dst, 0o755);
}

/**
 * 3-way merge baseContent→newContent onto appContent via `git merge-file`.
 *
 * @returns {{ merged: string, conflicts: number }} `conflicts` is the conflict count,
 *   or -1 on a hard failure (exit 255 or empty output for a non-empty input — binary/NUL
 *   or unmergeable content). On -1, `merged` echoes `appContent` and callers MUST leave
 *   the app's file untouched — writing the empty merge output would destroy it.
 */
function threeWayMerge(appContent, baseContent, newContent) {
  // PID-scoped so concurrent fleet runs don't overwrite each other's merge temp files.
  const cur = join(tmpdir(), `sk-mf-cur.${process.pid}.tmp`);
  const base = join(tmpdir(), `sk-mf-base.${process.pid}.tmp`);
  const other = join(tmpdir(), `sk-mf-new.${process.pid}.tmp`);
  writeFileSync(cur, appContent);
  writeFileSync(base, baseContent);
  writeFileSync(other, newContent);
  let merged, conflicts = 0;
  try {
    merged = execSync(`git merge-file -p "${cur}" "${base}" "${other}"`, { encoding: 'utf8' });
  } catch (e) {
    conflicts = typeof e.status === 'number' && e.status > 0 ? e.status : 1;
    merged = e.stdout?.toString() ?? appContent;
    // Exit 255 (git's hard-error code, e.g. "Cannot merge binary files") or an empty
    // merge of non-empty input means the output is garbage, not a merge result.
    if (e.status === 255 || (merged === '' && appContent !== '')) {
      conflicts = -1;
      merged = appContent;
    }
  } finally {
    rmSync(cur, { force: true });
    rmSync(base, { force: true });
    rmSync(other, { force: true });
  }
  return { merged, conflicts };
}

/**
 * Scan 3-way-merge output for defects that compile clean and ship silently:
 *   1. Residual conflict markers INSIDE block comments — `tsc` ignores `<<<<<<<`
 *      in a `/** ... *␐/` so `npm run typecheck` passes with the markers still there.
 *   2. Duplicate top-level declarations — when a function/const is absent from the
 *      (too-old) baseline but added on BOTH sides at different positions, the merge
 *      keeps both copies with NO conflict marker (later caught only as TS2393).
 * Returns an array of human-readable issue strings (empty = clean). Duplicate
 * detection runs only on JS/TS sources; marker detection on any text file.
 *
 * @param {string} content merged file content
 * @param {string} relPath path (selects whether duplicate detection applies)
 * @returns {string[]}
 */
function findMergeDefects(content, relPath) {
  const issues = [];
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    if (/^(<<<<<<<|=======|>>>>>>>)( |\t|$)/.test(line)) {
      issues.push(`conflict marker at line ${i + 1}: ${line.slice(0, 40)}`);
    }
  });
  if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(relPath)) {
    const counts = {};
    const decl = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*[(<]|^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|<)/;
    for (const line of lines) {
      const m = line.match(decl);
      const name = m && (m[1] || m[2]);
      if (name) counts[name] = (counts[name] || 0) + 1;
    }
    for (const [name, n] of Object.entries(counts)) {
      if (n > 1) issues.push(`duplicate top-level declaration "${name}" (${n}×) — likely TS2393`);
    }
  }
  return issues;
}

/**
 * Sync one template file into the app (3-way merge, add, or overwrite fallback).
 *
 * @returns {Promise<'ok'|'wrote'|'declined'|'conflicts'|'error'>} 'ok' = nothing to do,
 *   'wrote' = written cleanly, 'declined' = user kept their file, 'conflicts' = written
 *   with <<<<<<< markers, 'error' = merge failed hard and the file was left untouched.
 */
async function syncFile(relPath, baselineTag) {
  const dst = join(APP_ROOT, relPath);
  const newContent = showAtRef('HEAD', relPath);

  if (newContent === null) {
    console.log(`[skip] ${relPath} — not in latest skateboard`);
    return 'ok';
  }

  const oldRel = RENAMES[relPath];
  const dstExists = existsSync(dst);

  // App still has the pre-rename file and not the new one → migrate across the rename.
  if (!dstExists && oldRel && existsSync(join(APP_ROOT, oldRel))) {
    return migrateRenamedFile(relPath, oldRel, baselineTag, newContent);
  }

  const appContent = dstExists ? readFileSync(dst, 'utf8') : '';

  if (dstExists && appContent === newContent) {
    console.log(`[ok]   ${relPath}`);
    return 'ok';
  }

  // App doesn't have this file yet → offer to add it verbatim.
  if (!dstExists) {
    console.log(`\n[new]  ${relPath} — not present in app`);
    if (await confirm(`Add ${relPath}?`)) {
      writeSynced(dst, relPath, newContent);
      console.log(`[wrote] ${relPath}`);
      return 'wrote';
    }
    console.log(`[kept]  (absent) ${relPath}`);
    return 'declined';
  }

  // Baseline lookup falls back to the pre-rename path for baselines older than the rename.
  const baseContent = baselineTag
    ? (showAtRef(baselineTag, relPath) ?? (oldRel ? showAtRef(baselineTag, oldRel) : null))
    : null;

  // No baseline → can't merge; legacy overwrite-with-confirm (and warn).
  if (baseContent === null) {
    console.log(`\n[diff] ${relPath}  (no baseline — full overwrite; your edits would be replaced)`);
    showDiff(appContent, newContent, relPath);
    if (await confirm(`Overwrite ${relPath} with the latest template version?`)) {
      writeSynced(dst, relPath, newContent);
      console.log(`[wrote] ${relPath}`);
      return 'wrote';
    }
    console.log(`[kept]  ${relPath}`);
    return 'declined';
  }

  if (baseContent === newContent) {
    console.log(`[ok]   ${relPath} (template unchanged since ${baselineTag}; your edits kept)`);
    return 'ok';
  }

  const { merged, conflicts } = threeWayMerge(appContent, baseContent, newContent);

  // Hard merge failure — do NOT write or delete anything.
  if (conflicts === -1) {
    console.log(`[error] ${relPath} — git merge-file failed (binary or unmergeable content); file left untouched`);
    return 'error';
  }

  if (merged === appContent) {
    console.log(`[ok]   ${relPath} (template changes already present)`);
    return 'ok';
  }

  // A clean (conflicts === 0) merge can still ship a duplicate declaration with no
  // marker, so always scan the output — not just when git reported a conflict.
  const defects = findMergeDefects(merged, relPath);

  console.log(`\n[merge] ${relPath}${conflicts ? ` — ${conflicts} CONFLICT(S)` : ''}${defects.length ? ` — ${defects.length} DEFECT(S)` : ''}`);
  showDiff(appContent, merged, relPath);

  if (conflicts || defects.length) {
    if (conflicts) console.log(`  ⚠ ${conflicts} conflict(s): merged file will contain <<<<<<< markers to resolve by hand.`);
    for (const d of defects) console.log(`  ⚠ ${d}`);
    if (await confirm(`Write ${relPath} anyway? (needs manual cleanup before it builds)`)) {
      writeSynced(dst, relPath, merged);
      console.log(`[wrote w/ issues] ${relPath}`);
      return 'conflicts';
    }
    console.log(`[kept]  ${relPath}`);
    return 'declined';
  }
  if (await confirm(`Apply merged update to ${relPath}? (your edits preserved)`)) {
    writeSynced(dst, relPath, merged);
    console.log(`[wrote] ${relPath}`);
    return 'wrote';
  }
  console.log(`[kept]  ${relPath}`);
  return 'declined';
}

/**
 * Migrate a template-renamed file (e.g. backend/server.js → backend/server.ts):
 * 3-way merge the app's old-named file (current) against the old path at the
 * baseline tag (base) and the new path at HEAD (new) — `git merge-file` is
 * content-based, so names don't matter and local edits survive the rename.
 * Writes the result under the new name and removes the old file on confirm.
 *
 * @returns {Promise<'ok'|'wrote'|'declined'|'conflicts'|'error'>} same statuses as syncFile.
 */
async function migrateRenamedFile(relPath, oldRel, baselineTag, newContent) {
  const dst = join(APP_ROOT, relPath);
  const oldDst = join(APP_ROOT, oldRel);
  const appContent = readFileSync(oldDst, 'utf8');
  const baseContent = baselineTag ? showAtRef(baselineTag, oldRel) : null;

  // No baseline → can't merge; overwrite-with-confirm (and warn), like syncFile.
  if (baseContent === null) {
    console.log(`\n[rename] ${oldRel} → ${relPath}  (no baseline — full overwrite; your edits would be replaced)`);
    showDiff(appContent, newContent, relPath);
    if (await confirm(`Replace ${oldRel} with the latest ${relPath}?`)) {
      writeSynced(dst, relPath, newContent);
      rmSync(oldDst, { force: true });
      console.log(`[wrote] ${relPath}   [removed] ${oldRel}`);
      return 'wrote';
    }
    console.log(`[kept]  ${oldRel}`);
    return 'declined';
  }

  const { merged, conflicts } = threeWayMerge(appContent, baseContent, newContent);

  // Hard merge failure — do NOT write the new file or delete the old one.
  if (conflicts === -1) {
    console.log(`[error] ${oldRel} — git merge-file failed (binary or unmergeable content); file left untouched`);
    return 'error';
  }

  const defects = findMergeDefects(merged, relPath);
  const hasIssues = conflicts > 0 || defects.length > 0;

  console.log(`\n[rename] ${oldRel} → ${relPath}${conflicts ? ` — ${conflicts} CONFLICT(S)` : ''}${defects.length ? ` — ${defects.length} DEFECT(S)` : ''}`);
  showDiff(appContent, merged, relPath);

  if (conflicts) console.log(`  ⚠ ${conflicts} conflict(s): merged file will contain <<<<<<< markers to resolve by hand.`);
  for (const d of defects) console.log(`  ⚠ ${d}`);
  const prompt = hasIssues
    ? `Write ${relPath} anyway (needs manual cleanup) and remove ${oldRel}?`
    : `Migrate ${oldRel} to ${relPath}? (your edits preserved)`;
  if (await confirm(prompt)) {
    writeSynced(dst, relPath, merged);
    rmSync(oldDst, { force: true });
    console.log(`[wrote${hasIssues ? ' w/ issues' : ''}] ${relPath}   [removed] ${oldRel}`);
    return hasIssues ? 'conflicts' : 'wrote';
  }
  console.log(`[kept]  ${oldRel}`);
  return 'declined';
}

/**
 * Ensure `linkRel` is a symlink pointing at `targetRel` (both relative to the app root).
 *
 * Recreates the template's `CLAUDE.md → AGENTS.md` symlink. Unlike ALLOWLIST files this
 * is NOT copied via `git show` (which would yield the 9-byte target string, not content)
 * — it is materialized with `symlinkSync` so the app gets a real symlink.
 *
 * - link absent            → create it
 * - link already correct   → no-op
 * - link wrong target      → retarget
 * - link is a regular file → offer to replace (legacy real CLAUDE.md; its content should
 *                            already have migrated into AGENTS.md via RENAMES)
 * - target missing         → skip (nothing to point at)
 *
 * @returns {Promise<'ok'|'wrote'|'declined'|'error'>}
 */
async function ensureSymlink(linkRel, targetRel, { root = APP_ROOT, confirmFn = confirm } = {}) {
  const linkPath = join(root, linkRel);
  if (!existsSync(join(root, targetRel))) {
    console.log(`[skip] ${linkRel} symlink — target ${targetRel} not present`);
    return 'ok';
  }
  let stat = null;
  try { stat = lstatSync(linkPath); } catch { /* absent */ }

  if (stat?.isSymbolicLink()) {
    if (readlinkSync(linkPath) === targetRel) {
      console.log(`[ok]   ${linkRel} → ${targetRel}`);
      return 'ok';
    }
    unlinkSync(linkPath);
    symlinkSync(targetRel, linkPath);
    console.log(`[wrote] ${linkRel} → ${targetRel} (retargeted)`);
    return 'wrote';
  }

  if (stat) {
    if (stat.isDirectory()) {
      console.log(`[error] ${linkRel} is a directory — cannot convert to a symlink; resolve by hand`);
      return 'error';
    }
    console.log(`\n[symlink] ${linkRel} is a regular file; the template now ships it as a symlink → ${targetRel}`);
    if (await confirmFn(`Replace ${linkRel} with a symlink → ${targetRel}? (its content should already be in ${targetRel})`)) {
      unlinkSync(linkPath);
      symlinkSync(targetRel, linkPath);
      console.log(`[wrote] ${linkRel} → ${targetRel}`);
      return 'wrote';
    }
    console.log(`[kept]  ${linkRel}`);
    return 'declined';
  }

  symlinkSync(targetRel, linkPath);
  console.log(`[wrote] ${linkRel} → ${targetRel} (new symlink)`);
  return 'wrote';
}

/**
 * Merge the template's package.json deps/scripts into the app's (add/prune/update via
 * the baseline). Stamps `skateboardVersion` only when `stamp` is true — callers pass
 * false when any file ended declined/conflicted/errored so a re-run can finish the job.
 */
async function mergePackageJson(baselineTag, stamp = true) {
  const newPkg = JSON.parse(showAtRef('HEAD', 'package.json'));
  const appPkg = readJSON(join(APP_ROOT, 'package.json'));
  const baseRaw = baselineTag ? showAtRef(baselineTag, 'package.json') : null;
  const basePkg = baseRaw ? JSON.parse(baseRaw) : null;

  const adds = {}, removes = {}, updates = {};

  for (const key of ['dependencies', 'devDependencies']) {
    const appD = appPkg[key] || {};
    const newD = newPkg[key] || {};
    const baseD = basePkg?.[key] || {};
    // Template added a dep → add if the app doesn't already declare it.
    for (const [name, version] of Object.entries(newD)) {
      if (!(name in appD)) adds[`${key}.${name}`] = version;
    }
    if (basePkg) {
      // Template removed a dep → prune from app (only deps the template once shipped).
      for (const name of Object.keys(baseD)) {
        if (!(name in newD) && name in appD) removes[`${key}.${name}`] = appD[name];
      }
      // Template bumped a version → apply only if the app hadn't customized it.
      for (const [name, version] of Object.entries(newD)) {
        if (name in appD && name in baseD && appD[name] === baseD[name] && appD[name] !== version) {
          updates[`${key}.${name}`] = `${appD[name]} → ${version}`;
        }
      }
    }
  }

  // Scripts: add template-added scripts; update template-changed scripts the app
  // hasn't customized (e.g. root `server` start → dev). Never pruned — apps add their own.
  {
    const appS = appPkg.scripts || {}, newS = newPkg.scripts || {}, baseS = basePkg?.scripts || {};
    for (const [name, cmd] of Object.entries(newS)) {
      if (!(name in appS)) adds[`scripts.${name}`] = cmd;
      else if (basePkg && name in baseS && appS[name] === baseS[name] && appS[name] !== cmd) {
        updates[`scripts.${name}`] = `${appS[name]} → ${cmd}`;
      }
    }
  }

  const versionChanged = stamp && appPkg.skateboardVersion !== newPkg.version;
  if (!Object.keys(adds).length && !Object.keys(removes).length && !Object.keys(updates).length && !versionChanged) {
    console.log('\n[ok] package.json — no changes needed');
    return;
  }

  console.log('\n[diff] package.json');
  if (versionChanged) console.log(`  skateboardVersion: ${appPkg.skateboardVersion} → ${newPkg.version}`);
  for (const [k, v] of Object.entries(adds)) console.log(`  + ${k}: ${v}`);
  for (const [k, v] of Object.entries(removes)) console.log(`  - ${k}: ${v}  (removed upstream)`);
  for (const [k, v] of Object.entries(updates)) console.log(`  ~ ${k}: ${v}`);
  if (!basePkg) console.log(`  ⚠ no baseline tag for ${appPkg.skateboardVersion} — add-only; cannot prune removed deps or detect customized versions.`);

  // The postinstall hooksPath script points git away from .git/hooks — warn if the
  // app already has real (non-sample) hooks there that would silently stop running.
  if (String(adds['scripts.postinstall'] ?? '').includes('hooksPath')) {
    const hooksDir = join(APP_ROOT, '.git', 'hooks');
    const existingHooks = existsSync(hooksDir)
      ? readdirSync(hooksDir).filter(f => !f.endsWith('.sample'))
      : [];
    if (existingHooks.length) {
      console.log(`  ⚠ existing git hook(s) in .git/hooks (${existingHooks.join(', ')}) — the postinstall core.hooksPath script will bypass them; move them into .githooks/ to keep them running.`);
    }
  }

  if (!(await confirm('Apply package.json updates?'))) {
    console.log('[kept] package.json');
    return;
  }

  for (const key of ['dependencies', 'devDependencies']) {
    const appD = appPkg[key] || (appPkg[key] = {});
    const newD = newPkg[key] || {};
    const baseD = basePkg?.[key] || {};
    for (const [name, version] of Object.entries(newD)) {
      if (!(name in appD)) appD[name] = version;
    }
    if (basePkg) {
      for (const name of Object.keys(baseD)) {
        if (!(name in newD) && name in appD) delete appD[name];
      }
      for (const [name, version] of Object.entries(newD)) {
        if (name in appD && name in baseD && appD[name] === baseD[name]) appD[name] = version;
      }
    }
  }
  {
    const appS = appPkg.scripts || (appPkg.scripts = {}), newS = newPkg.scripts || {}, baseS = basePkg?.scripts || {};
    for (const [name, cmd] of Object.entries(newS)) {
      if (!(name in appS)) appS[name] = cmd;
      else if (basePkg && name in baseS && appS[name] === baseS[name]) appS[name] = cmd;
    }
  }
  if (stamp) appPkg.skateboardVersion = newPkg.version;
  writeJSON(join(APP_ROOT, 'package.json'), appPkg);
  console.log('[wrote] package.json');
}

async function main() {
  if (!existsSync(join(APP_ROOT, 'package.json'))) {
    console.error('No package.json in current directory.');
    process.exit(1);
  }

  const appPkg = readJSON(join(APP_ROOT, 'package.json'));
  const currentVersion = appPkg.skateboardVersion || 'unknown';

  fetchSkateboard();
  const newPkg = JSON.parse(showAtRef('HEAD', 'package.json'));

  console.log(`\nApp skateboardVersion: ${currentVersion}`);
  console.log(`Latest skateboard:     ${newPkg.version}`);

  // Stranded state: an older updater stamped skateboardVersion without migrating
  // renamed files (its allowlist predated the renames). Detect and keep going.
  const stranded = Object.entries(RENAMES).filter(([newRel, oldRel]) =>
    existsSync(join(APP_ROOT, oldRel)) && !existsSync(join(APP_ROOT, newRel)));

  // --baseline is an explicit request to re-sync, so it skips the up-to-date early-exit.
  if (currentVersion === newPkg.version && !stranded.length && !baselineArg) {
    console.log('\nAlready on latest. Nothing to do.');
    rmSync(TMP_DIR, { recursive: true, force: true });
    return;
  }
  if (currentVersion === newPkg.version && baselineArg) {
    console.log(`\n--baseline ${baselineArg} given — re-syncing even though skateboardVersion matches latest.`);
  }
  if (currentVersion === newPkg.version && stranded.length) {
    console.log(`\n⚠ skateboardVersion says ${currentVersion} but ${stranded.length} pre-rename file(s) remain (e.g. ${stranded[0][1]}).`);
    console.log('  Continuing so the rename migration can run. Pass --baseline <your-real-prior-version> for a proper 3-way merge.');
  }

  const baselineTag = resolveBaselineTag(baselineArg || currentVersion);
  if (baselineArg && !baselineTag) {
    console.log(`⚠ --baseline ${baselineArg} is not a tag in the template — ignoring.`);
  }
  console.log(baselineTag
    ? `Baseline for 3-way merge: tag ${baselineTag}`
    : `⚠ No tag for ${baselineArg || currentVersion} — falling back to overwrite/add-only (no merge or prune).`);
  console.log(SKIP_NOTE);

  const statuses = [];
  for (const relPath of ALLOWLIST) {
    statuses.push(await syncFile(relPath, baselineTag));
  }

  // Drop files the template deleted — keeping them is harmful (stale ambient
  // declarations shadow real driver types).
  for (const relPath of REMOVED) {
    const dst = join(APP_ROOT, relPath);
    if (!existsSync(dst)) continue;
    console.log(`\n[removed upstream] ${relPath} — the template deleted this file`);
    if (await confirm(`Delete ${relPath}?`)) {
      rmSync(dst, { force: true });
      console.log(`[removed] ${relPath}`);
      statuses.push('wrote');
    } else {
      console.log(`[kept]  ${relPath}`);
      statuses.push('declined');
    }
  }

  // Recreate template-owned symlinks (CLAUDE.md → AGENTS.md). Runs after the ALLOWLIST
  // loop so AGENTS.md exists and any legacy real CLAUDE.md has already migrated via RENAMES.
  for (const [linkRel, targetRel] of Object.entries(SYMLINKS)) {
    statuses.push(await ensureSymlink(linkRel, targetRel));
  }

  // Any declined/conflicted/errored file means the upgrade is incomplete — don't stamp
  // skateboardVersion (the dep/script merges are still offered above).
  const blocked = statuses.filter(s => s === 'declined' || s === 'conflicts' || s === 'error').length;
  await mergePackageJson(baselineTag, blocked === 0);
  if (blocked) {
    console.log(`\n⚠ ${blocked} file(s) declined/conflicted or carry merge defects (conflict markers / duplicate declarations).`);
    console.log(`  skateboardVersion left at ${currentVersion}. Resolve the flagged files, then re-run with --baseline ${currentVersion}.`);
    console.log(`  NOTE: markers inside JSDoc and duplicate functions COMPILE CLEAN — do not trust 'npm run typecheck' alone;`);
    console.log(`  confirm with: git grep -nE '^(<<<<<<<|=======|>>>>>>>)' -- '*.ts' '*.tsx'`);
    // Non-zero exit so CI / automation that runs this with --yes does not mistake a
    // marker-laden or duplicate-ridden result for success.
    process.exitCode = 1;
  }

  rmSync(TMP_DIR, { recursive: true, force: true });

  console.log('\nDone. Post-upgrade checklist:');
  console.log('  1. npm install');
  console.log('  2. npm run typecheck — your custom code merged into .ts files may need annotations');
  console.log('  3. See docs/UPGRADE.md for the agent prompt that automates conflict + type fixes.');

  // tsc already installed → offer to run the typecheck right here.
  if (existsSync(join(APP_ROOT, 'node_modules', '.bin', 'tsc'))) {
    console.log('\ntsc is installed. Note: typecheck is EXPECTED to fail until your custom code is annotated — the errors are the to-do list, not a regression.');
    if (await confirm('Run npm run typecheck now?')) {
      try {
        execSync('npm run typecheck', { cwd: APP_ROOT, stdio: 'inherit' });
        console.log('[ok] typecheck passed');
      } catch {
        console.log('[info] typecheck failed — annotate the reported code, then re-run npm run typecheck.');
      }
    }
  }
}

/** True when this file is the process entry point (not imported by a test). */
const isMain = (() => {
  try { return !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); }
  catch { return false; }
})();

if (isMain) main().catch(e => { console.error(e); process.exit(1); });

export { ALLOWLIST, REMOVED, RENAMES, SYMLINKS, ensureSymlink, findMergeDefects, threeWayMerge };
