import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const UI_PKG = '@stevederico/skateboard-ui';

const DENO_ARTIFACTS = ['deno.lock', 'deno.json', 'backend/deno.json', 'backend/deno.lock'];

/**
 * Verify installed skateboard-ui version matches package.json and npm-only stack.
 *
 * @param {string} [root=process.cwd()] - Project root directory
 * @returns {{ ok: true, message: string } | { ok: false, message: string }}
 */
export function verifyUiVersion(root = process.cwd()) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const want = (pkg.dependencies?.[UI_PKG] ?? pkg.devDependencies?.[UI_PKG] ?? '')
    .replace(/^[\^~]/, '');

  if (!want) {
    return { ok: false, message: `verify-ui-version: ${UI_PKG} not in package.json dependencies` };
  }

  for (const rel of DENO_ARTIFACTS) {
    if (existsSync(join(root, rel))) {
      return { ok: false, message: `verify-ui-version: remove ${rel} (npm-only stack)` };
    }
  }

  if (existsSync(join(root, 'node_modules', '.deno'))) {
    return { ok: false, message: 'verify-ui-version: remove node_modules/.deno and reinstall with npm' };
  }

  const uiPkgPath = join(root, 'node_modules', '@stevederico', 'skateboard-ui', 'package.json');
  if (!existsSync(uiPkgPath)) {
    return { ok: false, message: `verify-ui-version: run npm install (${UI_PKG} missing)` };
  }

  const got = JSON.parse(readFileSync(uiPkgPath, 'utf8')).version;
  if (got !== want) {
    return { ok: false, message: `verify-ui-version: want ${want}, installed ${got}` };
  }

  return { ok: true, message: `verify-ui-version: ${UI_PKG}@${got} ok` };
}