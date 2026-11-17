#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, chmodSync, readdirSync, lstatSync, readlinkSync, symlinkSync, unlinkSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const APP_ROOT = process.cwd();
const TMP_DIR = join(tmpdir(), `skateboard-update-${process.pid}`);
const REPO = process.env.SKATEBOARD_REPO || 'https://github.com/stevederico/skateboard.git';
const BRANCH = process.env.SKATEBOARD_BRANCH || '';

const GUARDRAIL_RULES = [
  'ban-ts-comment', 'clickable-element-needs-keyboard', 'compound-component-structure',
  'filename-convention', 'handler-naming', 'heading-text-wrap', 'icon-button-requires-label',
  'icon-requires-size', 'icons-through-funnel', 'img-requires-alt', 'import-order',
  'input-requires-label', 'layer-boundaries', 'motion-safe-animations',
  'no-arbitrary-spacing-radius', 'no-aria-hidden-on-focusable', 'no-banned-build-tooling',
  'no-browser-dialogs', 'no-class-components', 'no-classname-template-ternary',
  'no-dark-variant', 'no-database-drivers', 'no-deep-package-imports', 'no-direct-react-router',
  'no-dotenv', 'no-emoji-icons', 'no-empty-catch', 'no-eslint-or-playwright', 'no-explicit-any', 'no-fetch-in-effect',
  'no-focused-or-skipped-tests', 'no-foreign-test-frameworks', 'no-globals-package',
  'no-hardcoded-connection-strings', 'no-inline-svg', 'no-loading-text-in-button',
  'no-loose-types', 'no-non-null-assertion', 'no-other-icon-libraries',
  'no-outline-none-without-focus-ring', 'no-promise-then', 'no-raw-color-classes',
  'no-raw-form-elements', 'no-removed-skateboard-ui-imports', 'no-require',
  'no-space-utilities', 'no-third-party-http-clients', 'no-transition-all',
  'no-type-assertion', 'no-unknown-classes', 'prefer-size-utility',
  'suspense-skeleton-fallback', 'test-file-naming', 'use-list-data-states'
];

const ALLOWLIST = [
  'backend/Cargo.toml',
  'backend/Cargo.lock',
  'backend/rust-toolchain.toml',
  'backend/.gitignore',
  'backend/scripts/stripe-cli-replay.sh',
  'backend/src/lib.rs',
  'backend/src/main.rs',
  'backend/src/auth.rs',
  'backend/src/config.rs',
  'backend/src/crypto.rs',
  'backend/src/db.rs',
  'backend/src/hrana.rs',
  'backend/src/http.rs',
  'backend/src/json.rs',
  'backend/src/kdf.rs',
  'backend/src/middleware.rs',
  'backend/src/routes.rs',
  'backend/src/state.rs',
  'backend/src/stores.rs',
  'backend/src/stripe.rs',
  'backend/src/stripe_worker.rs',
  'backend/src/validation.rs',
  'public/theme-init.js',
  'tsconfig.json',
  'vite.config.ts',
  'vite.plugins.ts',
  'vite.plugins.test.js',
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
  'scripts/version-consistency.test.js',
  'scripts/test-docs.mjs',
  'SECURITY.md',
  '.oxlintrc.json',
  '.dependency-cruiser.js',
  'guardrails/verify/paths.js',
  'guardrails/verify/browser.js',
  'guardrails/verify/servers.js',
  'guardrails/verify/verify.e2e.js',
  'guardrails/package.json',
  'guardrails/package-lock.json',
  'guardrails/eslint-plugin/index.js',
  'guardrails/eslint-plugin/index.test.js',
  'guardrails/eslint-plugin/layers.js',
  'guardrails/eslint-plugin/lib/bannedImports.js',
  'guardrails/eslint-plugin/lib/classStrings.js',
  'guardrails/eslint-plugin/lib/jsx.js',
  'guardrails/eslint-plugin/lib/moduleSources.js',
  'guardrails/eslint-plugin/lib/paths.js',
  'guardrails/eslint-plugin/lib/ruleTester.js',
  ...GUARDRAIL_RULES.flatMap((rule) => [
    `guardrails/eslint-plugin/rules/${rule}.js`,
    `guardrails/eslint-plugin/rules/${rule}.test.js`
  ])
];

// CLAUDE.md is a symlink to AGENTS.md (the open-standard source of truth). It is NOT
// on the ALLOWLIST because `git show HEAD:CLAUDE.md` serves the symlink's TARGET STRING
// ("AGENTS.md"), not file content — syncing it as a regular file would overwrite the
// app's CLAUDE.md with the 9-byte string "AGENTS.md". ensureSymlink recreates the link.
const SYMLINKS = { 'CLAUDE.md': 'AGENTS.md' };

const REMOVED = [
  'backend/ambient.d.ts',
  'src/skateboard-ui.d.ts',
  'src/test/setup.js',
  'src/test/dom.js',
  'backend/package.json',
  'backend/tsconfig.json',
  'backend/types.ts',
  'backend/server.ts',
  'backend/server.js',
  'backend/server.test.ts',
  'backend/server.test.js',
  'backend/server.lifecycle.test.js',
  'backend/server.prod-import.test.js',
  'backend/adapters/manager.ts',
  'backend/adapters/manager.js',
  'backend/adapters/manager.test.js',
  'backend/adapters/sqlite.ts',
  'backend/adapters/sqlite.js',
  'backend/adapters/sqlite.test.js',
  'backend/adapters/postgres.ts',
  'backend/adapters/postgres.js',
  'backend/adapters/postgres.test.js',
  'backend/adapters/mongodb.ts',
  'backend/adapters/mongodb.js',
  'backend/adapters/mongodb.test.js',
  'backend/lib/auth.ts',
  'backend/lib/auth.js',
  'backend/lib/auth.test.js',
  'backend/lib/env.ts',
  'backend/lib/env.js',
  'backend/lib/env.test.js',
  'backend/lib/logger.ts',
  'backend/lib/logger.js',
  'backend/lib/logger.test.js',
  'backend/lib/store.ts',
  'backend/lib/store.js',
  'backend/lib/store.test.js',
  'backend/lib/validation.ts',
  'backend/lib/validation.js',
  'backend/lib/validation.test.js',
  'backend/vendor/legacy-bcrypt.js',
  'backend/vendor/legacy-bcrypt.d.ts',
  'eslint.config.js',
  'guardrails/verify/playwright.config.js',
  'guardrails/eslint-plugin/rules/require-jsdoc-on-exports.js',
  'guardrails/eslint-plugin/rules/require-jsdoc-on-exports.test.js'
];

const RENAMES = {
  'vite.config.ts': 'vite.config.js',
  'AGENTS.md': 'CLAUDE.md'
};

const SKIP_NOTE = `
Files NOT updated (app-owned — port manually if needed):
  - src/constants.json
  - src/main.jsx           (your routes — stays .jsx; Vite handles mixed JS/TS)
  - src/components/*       (your components)
  - src/icons.ts           (your icon funnel; create it if npm run lint asks)
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

function fetchSkateboard() {
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
  console.log('Fetching skateboard (full history for 3-way merge)...');
  execSync(`git clone ${BRANCH ? `--branch ${BRANCH} ` : ''}${REPO} ${TMP_DIR}`, { stdio: 'pipe' });
}

function readJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJSON(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

async function confirm(prompt) {
  if (yes) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ans = await rl.question(`${prompt} [y/N] `);
  rl.close();
  return ans.trim().toLowerCase().startsWith('y');
}

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

function showAtRef(ref, relPath) {
  try {
    return execSync(`git -C ${TMP_DIR} show ${ref}:${relPath}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

function showDiff(curContent, incomingContent, label) {
  const a = join(tmpdir(), 'sk-cur.tmp');
  const b = join(tmpdir(), 'sk-inc.tmp');
  writeFileSync(a, curContent);
  writeFileSync(b, incomingContent);
  try {
    execSync(`diff -u "${a}" "${b}" | head -60`, { stdio: 'inherit' });
  } catch (err) {
    // diff exits 1 when the files differ, which is the expected case. Anything else (no
    // `diff` binary, unreadable temp file) is surfaced but must not abort the update.
    if (err?.status !== 1) console.error(`[warn] could not show diff for ${label}: ${err?.message ?? err}`);
  }
  rmSync(a, { force: true });
  rmSync(b, { force: true });
}

function writeSynced(dst, relPath, content) {
  mkdirSync(dirname(dst), { recursive: true });
  writeFileSync(dst, content);
  if (relPath.startsWith('.githooks/')) chmodSync(dst, 0o755);
}

function threeWayMerge(appContent, baseContent, newContent) {
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

async function syncFile(relPath, baselineTag) {
  const dst = join(APP_ROOT, relPath);
  const newContent = showAtRef('HEAD', relPath);

  if (newContent === null) {
    console.log(`[skip] ${relPath} — not in latest skateboard`);
    return 'ok';
  }

  const oldRel = RENAMES[relPath];
  const dstExists = existsSync(dst);

  if (!dstExists && oldRel && existsSync(join(APP_ROOT, oldRel))) {
    return migrateRenamedFile(relPath, oldRel, baselineTag, newContent);
  }

  const appContent = dstExists ? readFileSync(dst, 'utf8') : '';

  if (dstExists && appContent === newContent) {
    console.log(`[ok]   ${relPath}`);
    return 'ok';
  }

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

  const baseContent = baselineTag
    ? (showAtRef(baselineTag, relPath) ?? (oldRel ? showAtRef(baselineTag, oldRel) : null))
    : null;

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

  if (conflicts === -1) {
    console.log(`[error] ${relPath} — git merge-file failed (binary or unmergeable content); file left untouched`);
    return 'error';
  }

  if (merged === appContent) {
    console.log(`[ok]   ${relPath} (template changes already present)`);
    return 'ok';
  }

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

async function migrateRenamedFile(relPath, oldRel, baselineTag, newContent) {
  const dst = join(APP_ROOT, relPath);
  const oldDst = join(APP_ROOT, oldRel);
  const appContent = readFileSync(oldDst, 'utf8');
  const baseContent = baselineTag ? showAtRef(baselineTag, oldRel) : null;

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

async function ensureSymlink(linkRel, targetRel, { root = APP_ROOT, confirmFn = confirm } = {}) {
  const linkPath = join(root, linkRel);
  if (!existsSync(join(root, targetRel))) {
    console.log(`[skip] ${linkRel} symlink — target ${targetRel} not present`);
    return 'ok';
  }
  const stat = lstatSync(linkPath, { throwIfNoEntry: false });

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
    for (const [name, version] of Object.entries(newD)) {
      if (!(name in appD)) adds[`${key}.${name}`] = version;
    }
    if (basePkg) {
      for (const name of Object.keys(baseD)) {
        if (!(name in newD) && name in appD) removes[`${key}.${name}`] = appD[name];
      }
      for (const [name, version] of Object.entries(newD)) {
        if (name in appD && name in baseD && appD[name] === baseD[name] && appD[name] !== version) {
          updates[`${key}.${name}`] = `${appD[name]} → ${version}`;
        }
      }
    }
  }

  {
    const appS = appPkg.scripts || {}, newS = newPkg.scripts || {}, baseS = basePkg?.scripts || {};
    for (const [name, cmd] of Object.entries(newS)) {
      if (!(name in appS)) adds[`scripts.${name}`] = cmd;
      else if (basePkg && name in baseS && appS[name] === baseS[name] && appS[name] !== cmd) {
        updates[`scripts.${name}`] = `${appS[name]} → ${cmd}`;
      }
    }
  }

  if (basePkg && !newPkg.workspaces && appPkg.workspaces) {
    removes.workspaces = JSON.stringify(appPkg.workspaces);
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
  if (basePkg && !newPkg.workspaces && appPkg.workspaces) {
    delete appPkg.workspaces;
  }
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

  const stranded = Object.entries(RENAMES).filter(([newRel, oldRel]) =>
    existsSync(join(APP_ROOT, oldRel)) && !existsSync(join(APP_ROOT, newRel)));

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

  for (const [linkRel, targetRel] of Object.entries(SYMLINKS)) {
    statuses.push(await ensureSymlink(linkRel, targetRel));
  }

  const blocked = statuses.filter(s => s === 'declined' || s === 'conflicts' || s === 'error').length;
  await mergePackageJson(baselineTag, blocked === 0);
  if (blocked) {
    console.log(`\n⚠ ${blocked} file(s) declined/conflicted or carry merge defects (conflict markers / duplicate declarations).`);
    console.log(`  skateboardVersion left at ${currentVersion}. Resolve the flagged files, then re-run with --baseline ${currentVersion}.`);
    console.log(`  NOTE: markers inside JSDoc and duplicate functions COMPILE CLEAN — do not trust 'npm run typecheck' alone;`);
    console.log(`  confirm with: git grep -nE '^(<<<<<<<|=======|>>>>>>>)' -- '*.ts' '*.tsx'`);
    process.exitCode = 1;
  }

  rmSync(TMP_DIR, { recursive: true, force: true });

  console.log('\nDone. Post-upgrade checklist:');
  console.log('  1. npm install');
  console.log('  2. npm run typecheck — your custom code merged into .ts files may need annotations');
  console.log('  3. See docs/UPGRADE.md for the agent prompt that automates conflict + type fixes.');
  console.log('  4. npm run guardrails:install && npm run lint (oxlint, a global CLI: mise use -g npm:oxlint) — each message names the fix (e.g. re-export icons from @stevederico/skateboard-ui/icons in src/icons.ts; lucide-react is no longer a dependency; router imports come from @stevederico/skateboard-ui/router, so remove react-router)');

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

const isMain = (() => {
  try { return !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); }
  catch { return false; }
})();

if (isMain) main().catch(e => { console.error(e); process.exit(1); });

export { ALLOWLIST, REMOVED, RENAMES, SYMLINKS, ensureSymlink, findMergeDefects, threeWayMerge };
