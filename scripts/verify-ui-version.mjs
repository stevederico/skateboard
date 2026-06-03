#!/usr/bin/env node
/**
 * Fail if installed @stevederico/skateboard-ui does not match package.json,
 * or if Deno install artifacts are still present.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const uiPkgPath = join(root, 'node_modules', '@stevederico', 'skateboard-ui', 'package.json');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const UI_PKG = '@stevederico/skateboard-ui';
const want = (pkg.dependencies?.[UI_PKG] ?? pkg.devDependencies?.[UI_PKG] ?? '')
  .replace(/^[\^~]/, '');

if (!want) {
  console.error(`verify-ui-version: ${UI_PKG} not in package.json dependencies`);
  process.exit(1);
}

for (const rel of ['deno.lock', 'deno.json', 'backend/deno.json', 'backend/deno.lock']) {
  if (existsSync(join(root, rel))) {
    console.error(`verify-ui-version: remove ${rel} (npm-only stack)`);
    process.exit(1);
  }
}

if (existsSync(join(root, 'node_modules', '.deno'))) {
  console.error('verify-ui-version: remove node_modules/.deno and reinstall with npm');
  process.exit(1);
}

if (!existsSync(uiPkgPath)) {
  console.error(`verify-ui-version: run npm install (${UI_PKG} missing)`);
  process.exit(1);
}
const got = JSON.parse(readFileSync(uiPkgPath, 'utf8')).version;

if (got !== want) {
  console.error(`verify-ui-version: want ${want}, installed ${got}`);
  process.exit(1);
}

console.log(`verify-ui-version: ${UI_PKG}@${got} ok`);