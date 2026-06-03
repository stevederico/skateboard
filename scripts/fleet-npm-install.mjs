#!/usr/bin/env node
/**
 * Reinstall deps for every app that depends on @stevederico/skateboard-ui.
 * Uses --min-release-age=0 only for that package (global ~/.npmrc has min-release-age=7).
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { globSync } from 'node:fs';

const ROOT = '/Users/sd/Desktop/projects';
const UI_PKG = '@stevederico/skateboard-ui';

const packageFiles = globSync(`${ROOT}/**/package.json`).filter(
  (p) => !p.includes('node_modules') && !p.includes('/.claude/'),
);

const apps = [];

for (const pkgPath of packageFiles) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    continue;
  }
  const version = pkg.dependencies?.[UI_PKG] ?? pkg.devDependencies?.[UI_PKG];
  if (!version) continue;
  const dir = dirname(pkgPath);
  apps.push({ dir, version: version.replace(/^[\^~]/, '') });
}

apps.sort((a, b) => a.dir.localeCompare(b.dir));

const failed = [];
let ok = 0;

for (const { dir, version } of apps) {
  const name = dir.replace(`${ROOT}/`, '');
  const nm = join(dir, 'node_modules');
  const denoNm = join(nm, '.deno');
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

  process.stdout.write(`\n=== ${name} (${version}) ===\n`);

  try {
    if (existsSync(denoNm)) {
      process.stdout.write('  rm node_modules (.deno)\n');
      rmSync(nm, { recursive: true, force: true });
    }

    execSync(
      `npm install ${UI_PKG}@${version} --save-exact --min-release-age=0`,
      { cwd: dir, stdio: 'inherit', env: process.env },
    );

    execSync('npm install', { cwd: dir, stdio: 'inherit', env: process.env });

    const hasBackendWorkspace =
      Array.isArray(pkg.workspaces) &&
      pkg.workspaces.some((w) => w === 'backend' || w.includes('backend'));
    if (hasBackendWorkspace && existsSync(join(dir, 'backend', 'package.json'))) {
      execSync('npm install --workspace=backend', {
        cwd: dir,
        stdio: 'inherit',
        env: process.env,
      });
    } else if (existsSync(join(dir, 'backend', 'package.json'))) {
      execSync('npm install', {
        cwd: join(dir, 'backend'),
        stdio: 'inherit',
        env: process.env,
      });
    }

    const installed = join(nm, UI_PKG, 'package.json');
    if (existsSync(installed)) {
      const ui = JSON.parse(readFileSync(installed, 'utf8'));
      process.stdout.write(`  ✓ skateboard-ui ${ui.version}\n`);
    }
    ok += 1;
  } catch (err) {
    failed.push({ name, error: err.message ?? String(err) });
    process.stderr.write(`  ✗ ${name}\n`);
  }
}

process.stdout.write(`\nDone: ${ok}/${apps.length} ok`);
if (failed.length) {
  process.stderr.write(`\nFailed (${failed.length}):\n`);
  for (const f of failed) {
    process.stderr.write(`  - ${f.name}: ${f.error}\n`);
  }
  process.exit(1);
}