#!/usr/bin/env node
/** Copy verify-ui-version.mjs and add verify:ui script to fleet apps. */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, 'verify-ui-version.mjs');
const ROOT = '/Users/sd/Desktop/projects';
const UI_PKG = '@stevederico/skateboard-ui';

for (const pkgPath of globSync(`${ROOT}/**/package.json`).filter(
  (p) => !p.includes('node_modules') && !p.includes('/.claude/'),
)) {
  const dir = dirname(pkgPath);
  if (dir === join(ROOT, 'skateboard')) continue;
  if (!existsSync(join(dir, '.git'))) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!pkg.dependencies?.[UI_PKG]) continue;
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  cpSync(SRC, join(dir, 'scripts/verify-ui-version.mjs'));
  if (!pkg.scripts) pkg.scripts = {};
  if (pkg.scripts['verify:ui']) continue;
  pkg.scripts['verify:ui'] = 'node scripts/verify-ui-version.mjs';
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  const name = dir.replace(`${ROOT}/`, '');
  try {
    execSync('git add scripts/verify-ui-version.mjs package.json', { cwd: dir, stdio: 'pipe' });
    const st = execSync('git status --porcelain', { cwd: dir, encoding: 'utf8' }).trim();
    if (st) {
      execSync('git commit -m "Add verify:ui npm script"', { cwd: dir, stdio: 'pipe' });
      console.log(`committed ${name}`);
    }
  } catch (e) {
    console.error(`skip ${name}`);
  }
}