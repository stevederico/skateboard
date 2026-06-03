#!/usr/bin/env node
/** Commit pending npm/deno migration changes in fleet apps. */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { globSync } from 'node:fs';

const ROOT = '/Users/sd/Desktop/projects';
const UI_PKG = '@stevederico/skateboard-ui';
const DENO_PATHS = ['deno.lock', 'deno.json', 'backend/deno.json', 'backend/deno.lock'];

function runQuiet(cmd, cwd) {
  execSync(cmd, { cwd, stdio: 'pipe', env: process.env });
}

function stage(dir) {
  const gitignorePath = join(dir, '.gitignore');
  if (existsSync(gitignorePath)) {
    const lines = readFileSync(gitignorePath, 'utf8').split('\n');
    const filtered = lines.filter((line) => {
      const t = line.trim();
      return t !== 'package-lock.json' && t !== 'backend/package-lock.json';
    });
    if (filtered.length !== lines.length) {
      writeFileSync(gitignorePath, filtered.join('\n').replace(/\n+$/, '\n'));
      runQuiet('git add .gitignore', dir);
    }
  }
  runQuiet('git add package.json', dir);
  for (const rel of ['package-lock.json', 'backend/package-lock.json']) {
    if (existsSync(join(dir, rel))) runQuiet(`git add -f "${rel}"`, dir);
  }
  for (const rel of DENO_PATHS) {
    try {
      runQuiet(`git add -u "${rel}"`, dir);
    } catch {
      /* */
    }
    if (existsSync(join(dir, rel))) {
      try {
        runQuiet(`git rm -f "${rel}"`, dir);
      } catch {
        /* */
      }
    }
  }
}

const packageFiles = globSync(`${ROOT}/**/package.json`).filter(
  (p) => !p.includes('node_modules') && !p.includes('/.claude/'),
);

let n = 0;
for (const pkgPath of packageFiles) {
  const dir = dirname(pkgPath);
  if (!existsSync(join(dir, '.git'))) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const version = pkg.dependencies?.[UI_PKG];
  if (!version) continue;
  const ver = version.replace(/^[\^~]/, '');
  const before = execSync('git status --porcelain', { cwd: dir, encoding: 'utf8' }).trim();
  if (!before) continue;
  const name = dir.replace(`${ROOT}/`, '');
  try {
    stage(dir);
    const after = execSync('git status --porcelain', { cwd: dir, encoding: 'utf8' }).trim();
    if (!after) continue;
    runQuiet(`git commit -m "Lock npm deps; remove deno; skateboard-ui ${ver}"`, dir);
    console.log(`committed ${name}`);
    n += 1;
  } catch (e) {
    console.error(`failed ${name}:`, e.stderr?.toString() || e.message);
  }
}
console.log(`done: ${n} commits`);