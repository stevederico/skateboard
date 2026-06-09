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
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline/promises';

const APP_ROOT = process.cwd();
const TMP_DIR = '/tmp/skateboard-update';
const REPO = process.env.SKATEBOARD_REPO || 'https://github.com/stevederico/skateboard.git';
const BRANCH = process.env.SKATEBOARD_BRANCH || '';

// Template-owned files (current names at HEAD). App-owned files (constants.json,
// components, config.json, .env, main.jsx) are never touched — see SKIP_NOTE.
const ALLOWLIST = [
  'backend/server.ts',
  'backend/server.test.ts',
  'backend/adapters/manager.ts',
  'backend/adapters/sqlite.ts',
  'backend/adapters/postgres.ts',
  'backend/adapters/mongodb.ts',
  'backend/types.ts',
  'backend/ambient.d.ts',
  'backend/tsconfig.json',
  'backend/vendor/legacy-bcrypt.js',
  'backend/vendor/legacy-bcrypt.d.ts',
  'backend/package.json',
  'tsconfig.json',
  'src/types/skateboard-ui.d.ts',
  'vite.config.ts',
  'Dockerfile',
  '.dockerignore',
  '.gitignore',
  'scripts/update-skateboard.js'
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
  'vite.config.ts': 'vite.config.js'
};

const SKIP_NOTE = `
Files NOT updated (app-owned — port manually if needed):
  - src/constants.json
  - src/main.jsx           (your routes — stays .jsx; Vite handles mixed JS/TS)
  - src/components/*       (your components)
  - src/assets/styles.css  (your theme overrides)
  - backend/config.json
  - backend/.env*
(exception: src/types/skateboard-ui.d.ts is template-owned type scaffolding)
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
 * 3-way merge baseContent→newContent onto appContent via `git merge-file`.
 *
 * @returns {{ merged: string, conflicts: number }}
 */
function threeWayMerge(appContent, baseContent, newContent) {
  const cur = join(tmpdir(), 'sk-mf-cur.tmp');
  const base = join(tmpdir(), 'sk-mf-base.tmp');
  const other = join(tmpdir(), 'sk-mf-new.tmp');
  writeFileSync(cur, appContent);
  writeFileSync(base, baseContent);
  writeFileSync(other, newContent);
  let merged, conflicts = 0;
  try {
    merged = execSync(`git merge-file -p "${cur}" "${base}" "${other}"`, { encoding: 'utf8' });
  } catch (e) {
    conflicts = typeof e.status === 'number' && e.status > 0 ? e.status : 1;
    merged = e.stdout?.toString() ?? appContent;
  }
  rmSync(cur, { force: true });
  rmSync(base, { force: true });
  rmSync(other, { force: true });
  return { merged, conflicts };
}

async function syncFile(relPath, baselineTag) {
  const dst = join(APP_ROOT, relPath);
  const newContent = showAtRef('HEAD', relPath);

  if (newContent === null) {
    console.log(`[skip] ${relPath} — not in latest skateboard`);
    return;
  }

  const oldRel = RENAMES[relPath];
  const dstExists = existsSync(dst);

  // App still has the pre-rename file and not the new one → migrate across the rename.
  if (!dstExists && oldRel && existsSync(join(APP_ROOT, oldRel))) {
    await migrateRenamedFile(relPath, oldRel, baselineTag, newContent);
    return;
  }

  const appContent = dstExists ? readFileSync(dst, 'utf8') : '';

  if (dstExists && appContent === newContent) {
    console.log(`[ok]   ${relPath}`);
    return;
  }

  // App doesn't have this file yet → offer to add it verbatim.
  if (!dstExists) {
    console.log(`\n[new]  ${relPath} — not present in app`);
    if (await confirm(`Add ${relPath}?`)) {
      mkdirSync(dirname(dst), { recursive: true });
      writeFileSync(dst, newContent);
      console.log(`[wrote] ${relPath}`);
    } else {
      console.log(`[kept]  (absent) ${relPath}`);
    }
    return;
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
      writeFileSync(dst, newContent);
      console.log(`[wrote] ${relPath}`);
    } else {
      console.log(`[kept]  ${relPath}`);
    }
    return;
  }

  if (baseContent === newContent) {
    console.log(`[ok]   ${relPath} (template unchanged since ${baselineTag}; your edits kept)`);
    return;
  }

  const { merged, conflicts } = threeWayMerge(appContent, baseContent, newContent);

  if (merged === appContent) {
    console.log(`[ok]   ${relPath} (template changes already present)`);
    return;
  }

  console.log(`\n[merge] ${relPath}${conflicts ? ` — ${conflicts} CONFLICT(S)` : ''}`);
  showDiff(appContent, merged, relPath);

  if (conflicts) {
    console.log(`  ⚠ ${conflicts} conflict(s): merged file will contain <<<<<<< markers to resolve by hand.`);
    if (await confirm(`Write ${relPath} with conflict markers?`)) {
      writeFileSync(dst, merged);
      console.log(`[wrote w/ conflicts] ${relPath}`);
    } else {
      console.log(`[kept]  ${relPath}`);
    }
  } else if (await confirm(`Apply merged update to ${relPath}? (your edits preserved)`)) {
    writeFileSync(dst, merged);
    console.log(`[wrote] ${relPath}`);
  } else {
    console.log(`[kept]  ${relPath}`);
  }
}

/**
 * Migrate a template-renamed file (e.g. backend/server.js → backend/server.ts):
 * 3-way merge the app's old-named file (current) against the old path at the
 * baseline tag (base) and the new path at HEAD (new) — `git merge-file` is
 * content-based, so names don't matter and local edits survive the rename.
 * Writes the result under the new name and removes the old file on confirm.
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
      mkdirSync(dirname(dst), { recursive: true });
      writeFileSync(dst, newContent);
      rmSync(oldDst, { force: true });
      console.log(`[wrote] ${relPath}   [removed] ${oldRel}`);
    } else {
      console.log(`[kept]  ${oldRel}`);
    }
    return;
  }

  const { merged, conflicts } = threeWayMerge(appContent, baseContent, newContent);

  console.log(`\n[rename] ${oldRel} → ${relPath}${conflicts ? ` — ${conflicts} CONFLICT(S)` : ''}`);
  showDiff(appContent, merged, relPath);

  if (conflicts) {
    console.log(`  ⚠ ${conflicts} conflict(s): merged file will contain <<<<<<< markers to resolve by hand.`);
  }
  const prompt = conflicts
    ? `Write ${relPath} with conflict markers and remove ${oldRel}?`
    : `Migrate ${oldRel} to ${relPath}? (your edits preserved)`;
  if (await confirm(prompt)) {
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, merged);
    rmSync(oldDst, { force: true });
    console.log(`[wrote] ${relPath}   [removed] ${oldRel}`);
  } else {
    console.log(`[kept]  ${oldRel}`);
  }
}

async function mergePackageJson(baselineTag) {
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

  const versionChanged = appPkg.skateboardVersion !== newPkg.version;
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
  appPkg.skateboardVersion = newPkg.version;
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

  if (currentVersion === newPkg.version && !stranded.length) {
    console.log('\nAlready on latest. Nothing to do.');
    rmSync(TMP_DIR, { recursive: true, force: true });
    return;
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

  for (const relPath of ALLOWLIST) {
    await syncFile(relPath, baselineTag);
  }

  await mergePackageJson(baselineTag);

  rmSync(TMP_DIR, { recursive: true, force: true });
  console.log('\nDone. Run your install command (deno install / npm install) and test the app.');
}

main().catch(e => { console.error(e); process.exit(1); });
