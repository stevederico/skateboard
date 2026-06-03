#!/usr/bin/env node
/**
 * Fleet npm migration: pull, remove deno artifacts, install with UI-only
 * min-release-age=0, verify, optional build/commit.
 *
 * Usage:
 *   node scripts/fleet-migrate.mjs [--commit] [--build] [--only=BXClub,ginza]
 *
 * Excludes hackathon archives by default. Target UI from each package.json.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKATEBOARD_ROOT = join(__dirname, '..');
const ROOT = '/Users/sd/Desktop/projects';
const UI_PKG = '@stevederico/skateboard-ui';
const VERIFY = join(SKATEBOARD_ROOT, 'scripts/verify-ui-version.mjs');

const EXCLUDE_DIRS = new Set([
  `${ROOT}/x-tv`,
  `${ROOT}/xai-hackathon/x-tv`,
  `${ROOT}/xai-hackathon-sept-25/xos`,
]);

const args = process.argv.slice(2);
const doCommit = args.includes('--commit');
const doBuild = args.includes('--build');
const onlyArg = args.find((a) => a.startsWith('--only='));
const onlyNames = onlyArg
  ? new Set(onlyArg.slice(7).split(',').map((s) => s.trim()))
  : null;

const DENO_PATHS = ['deno.lock', 'deno.json', 'backend/deno.json', 'backend/deno.lock'];

function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: 'inherit', env: process.env });
}

function runQuiet(cmd, cwd) {
  execSync(cmd, { cwd, stdio: 'pipe', env: process.env });
}

const packageFiles = globSync(`${ROOT}/**/package.json`).filter(
  (p) => !p.includes('node_modules') && !p.includes('/.claude/'),
);

const apps = [];
for (const pkgPath of packageFiles) {
  const dir = dirname(pkgPath);
  if (EXCLUDE_DIRS.has(dir)) continue;
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    continue;
  }
  const version = pkg.dependencies?.[UI_PKG] ?? pkg.devDependencies?.[UI_PKG];
  if (!version) continue;
  const name = dir.replace(`${ROOT}/`, '');
  if (onlyNames && !onlyNames.has(name) && !onlyNames.has(dir)) continue;
  apps.push({
    dir,
    name,
    version: version.replace(/^[\^~]/, ''),
    pkg,
  });
}

apps.sort((a, b) => a.name.localeCompare(b.name));

const failed = [];
let ok = 0;

for (const { dir, name, version, pkg } of apps) {
  process.stdout.write(`\n=== ${name} (${version}) ===\n`);
  try {
    if (existsSync(join(dir, '.git'))) {
      try {
        runQuiet('git pull origin', dir);
        process.stdout.write('  git pull ok\n');
      } catch {
        process.stdout.write('  git pull skipped/failed\n');
      }
      for (const rel of DENO_PATHS) {
        const full = join(dir, rel);
        if (!existsSync(full)) continue;
        try {
          runQuiet(`git rm -f "${rel}"`, dir);
          process.stdout.write(`  git rm ${rel}\n`);
        } catch {
          rmSync(full, { force: true });
        }
      }
    } else {
      for (const rel of DENO_PATHS) {
        rmSync(join(dir, rel), { force: true });
      }
    }

    const nm = join(dir, 'node_modules');
    if (existsSync(join(nm, '.deno'))) {
      rmSync(nm, { recursive: true, force: true });
      process.stdout.write('  rm node_modules (.deno)\n');
    }

    run(
      `npm install ${UI_PKG}@${version} --save-exact --min-release-age=0`,
      dir,
    );
    run('npm install', dir);

    const hasBackendWorkspace =
      Array.isArray(pkg.workspaces) &&
      pkg.workspaces.some((w) => w === 'backend' || String(w).includes('backend'));
    if (hasBackendWorkspace && existsSync(join(dir, 'backend', 'package.json'))) {
      run('npm install --workspace=backend', dir);
    } else if (existsSync(join(dir, 'backend', 'package.json'))) {
      run('npm install', join(dir, 'backend'));
    }

    run(`node "${VERIFY}"`, dir);

    if (doBuild && pkg.scripts?.build) {
      run('npm run build', dir);
    }

    if (doCommit && existsSync(join(dir, '.git'))) {
      runQuiet('git add package-lock.json backend/package-lock.json package.json', dir);
      for (const rel of DENO_PATHS) {
        try {
          runQuiet(`git add -u "${rel}"`, dir);
        } catch {
          /* not tracked */
        }
      }
      const status = execSync('git status --porcelain', {
        cwd: dir,
        encoding: 'utf8',
      }).trim();
      if (status) {
        runQuiet(
          'git commit -m "Lock npm deps; remove deno; skateboard-ui ' + version + '"',
          dir,
        );
        process.stdout.write('  committed\n');
      } else {
        process.stdout.write('  nothing to commit\n');
      }
    }

    ok += 1;
  } catch (err) {
    failed.push({ name, error: err.message ?? String(err) });
    process.stderr.write(`  ✗ ${name}\n`);
  }
}

process.stdout.write(`\nDone: ${ok}/${apps.length} ok\n`);
if (failed.length) {
  for (const f of failed) {
    process.stderr.write(`  - ${f.name}: ${f.error}\n`);
  }
  process.exit(1);
}