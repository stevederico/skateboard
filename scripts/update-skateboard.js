#!/usr/bin/env node

/**
 * Update an app's skateboard boilerplate files to match the latest release.
 *
 * Reads `skateboardVersion` from the app's package.json, clones skateboard
 * at master, then applies a fixed allowlist of "boilerplate-owned" files.
 * Never touches app-owned files (constants.json, components, db config, env).
 *
 * Shows a diff for each change and requires confirmation before writing.
 * Re-runnable; safe to abort at any prompt.
 *
 * Usage:
 *   node scripts/update-skateboard.js          # interactive
 *   node scripts/update-skateboard.js --yes    # apply all without prompts
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const APP_ROOT = process.cwd();
const TMP_DIR = '/tmp/skateboard-update';
const REPO = 'https://github.com/stevederico/skateboard.git';

const ALLOWLIST = [
  'backend/server.js',
  'backend/server.test.js',
  'backend/adapters/manager.js',
  'backend/adapters/sqlite.js',
  'backend/adapters/postgres.js',
  'backend/adapters/mongodb.js',
  'vite.config.js',
  'Dockerfile',
  '.dockerignore',
  '.gitignore',
  'scripts/update-skateboard.js'
];

const SKIP_NOTE = `
Files NOT updated (app-owned — port manually if needed):
  - src/constants.json
  - src/main.jsx          (your routes)
  - src/components/*      (your components)
  - src/assets/styles.css (your theme overrides)
  - backend/config.json
  - backend/.env*
`;

const yes = process.argv.includes('--yes') || process.argv.includes('-y');

function fetchSkateboard() {
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
  console.log('Fetching latest skateboard...');
  execSync(`git clone --depth 1 ${REPO} ${TMP_DIR}`, { stdio: 'pipe' });
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

function showDiff(srcPath, dstPath) {
  try {
    execSync(`diff -u "${dstPath}" "${srcPath}" | head -40`, { stdio: 'inherit' });
  } catch {
    // diff exits 1 when files differ — expected
  }
}

async function syncFile(relPath) {
  const src = join(TMP_DIR, relPath);
  const dst = join(APP_ROOT, relPath);

  if (!existsSync(src)) {
    console.log(`[skip] ${relPath} — not in latest skateboard`);
    return;
  }

  const srcContent = readFileSync(src, 'utf8');
  const dstExists = existsSync(dst);
  const dstContent = dstExists ? readFileSync(dst, 'utf8') : '';

  if (srcContent === dstContent) {
    console.log(`[ok]   ${relPath}`);
    return;
  }

  console.log(`\n[diff] ${relPath}`);
  showDiff(src, dst);

  if (await confirm(`Apply update to ${relPath}?`)) {
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, srcContent);
    console.log(`[wrote] ${relPath}`);
  } else {
    console.log(`[kept]  ${relPath}`);
  }
}

async function mergePackageJson() {
  const srcPkg = readJSON(join(TMP_DIR, 'package.json'));
  const dstPkg = readJSON(join(APP_ROOT, 'package.json'));

  const additions = {
    dependencies: {},
    devDependencies: {}
  };

  for (const key of ['dependencies', 'devDependencies']) {
    for (const [name, version] of Object.entries(srcPkg[key] || {})) {
      if (!dstPkg[key]?.[name]) {
        additions[key][name] = version;
      }
    }
  }

  const newDepCount = Object.keys(additions.dependencies).length + Object.keys(additions.devDependencies).length;
  const versionChanged = dstPkg.skateboardVersion !== srcPkg.version;

  if (!newDepCount && !versionChanged) {
    console.log('\n[ok] package.json — no changes needed');
    return;
  }

  console.log('\n[diff] package.json');
  if (versionChanged) console.log(`  skateboardVersion: ${dstPkg.skateboardVersion} → ${srcPkg.version}`);
  for (const k of Object.keys(additions.dependencies)) console.log(`  + ${k}: ${additions.dependencies[k]}`);
  for (const k of Object.keys(additions.devDependencies)) console.log(`  + ${k}: ${additions.devDependencies[k]} (dev)`);

  if (!(await confirm('Apply package.json updates?'))) {
    console.log('[kept] package.json');
    return;
  }

  dstPkg.skateboardVersion = srcPkg.version;
  dstPkg.dependencies = { ...dstPkg.dependencies, ...additions.dependencies };
  dstPkg.devDependencies = { ...dstPkg.devDependencies, ...additions.devDependencies };
  writeJSON(join(APP_ROOT, 'package.json'), dstPkg);
  console.log('[wrote] package.json');
}

async function main() {
  if (!existsSync(join(APP_ROOT, 'package.json'))) {
    console.error('No package.json in current directory.');
    process.exit(1);
  }

  const dstPkg = readJSON(join(APP_ROOT, 'package.json'));
  const currentVersion = dstPkg.skateboardVersion || 'unknown';

  fetchSkateboard();
  const srcPkg = readJSON(join(TMP_DIR, 'package.json'));

  console.log(`\nApp skateboardVersion: ${currentVersion}`);
  console.log(`Latest skateboard:     ${srcPkg.version}`);

  if (currentVersion === srcPkg.version) {
    console.log('\nAlready on latest. Nothing to do.');
    rmSync(TMP_DIR, { recursive: true, force: true });
    return;
  }

  console.log(SKIP_NOTE);

  for (const relPath of ALLOWLIST) {
    await syncFile(relPath);
  }

  await mergePackageJson();

  rmSync(TMP_DIR, { recursive: true, force: true });
  console.log('\nDone. Run your install command (deno install / npm install) and test the app.');
}

main().catch(e => { console.error(e); process.exit(1); });
