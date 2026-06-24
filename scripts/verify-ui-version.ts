import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const UI_PKG = '@stevederico/skateboard-ui';

/** Filesystem operations this module needs — injectable so tests avoid mocking `node:fs`. */
interface FsSeam {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
}

/** Live filesystem seam. Overridden in tests via {@link __setFsForTests}. */
let fs: FsSeam = { existsSync, readFileSync };

/**
 * Test-only seam: swap the filesystem backend. Avoids `mock.module('node:fs')`, whose
 * named/default exports don't survive `--experimental-test-module-mocks` reliably across
 * Node versions (Node 24.14 breaks named-import resolution on the mocked builtin).
 *
 * @param seam - Replacement existsSync/readFileSync implementations
 */
export function __setFsForTests(seam: FsSeam): void {
  fs = seam;
}

const DENO_ARTIFACTS = ['deno.lock', 'deno.json', 'backend/deno.json', 'backend/deno.lock'];

/**
 * Result of a verifyUiVersion check.
 */
export interface VerifyResult {
  ok: boolean;
  message: string;
}

/**
 * Minimal shape of a package.json read for dependency resolution.
 */
interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  version?: string;
}

/**
 * Narrow an unknown value to a record of string-keyed string values.
 *
 * @param value - Candidate dependency map
 * @returns The validated record, or undefined if any value is not a string
 */
function asStringRecord(value: unknown): Record<string, string> | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const record: Record<string, string> = {};
  for (const [key, val] of Object.entries(value)) {
    if (typeof val !== 'string') {
      return undefined;
    }
    record[key] = val;
  }
  return record;
}

/**
 * Parse a package.json file and validate it is an object at the boundary.
 *
 * @param path - Absolute path to the package.json file
 * @returns Parsed manifest with optional dependency/version fields
 */
function readManifest(path: string): PackageManifest {
  const parsed: unknown = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`verify-ui-version: invalid package.json at ${path}`);
  }
  const manifest: PackageManifest = {};
  if ('dependencies' in parsed) {
    manifest.dependencies = asStringRecord(parsed.dependencies);
  }
  if ('devDependencies' in parsed) {
    manifest.devDependencies = asStringRecord(parsed.devDependencies);
  }
  if ('version' in parsed && typeof parsed.version === 'string') {
    manifest.version = parsed.version;
  }
  return manifest;
}

/**
 * Verify installed skateboard-ui version matches package.json and npm-only stack.
 *
 * @param root - Project root directory (defaults to process.cwd())
 * @returns Result object indicating success or the reason for failure
 */
export function verifyUiVersion(root: string = process.cwd()): VerifyResult {
  const pkg = readManifest(join(root, 'package.json'));
  const want = (pkg.dependencies?.[UI_PKG] ?? pkg.devDependencies?.[UI_PKG] ?? '').replace(/^[\^~]/, '');

  if (!want) {
    return { ok: false, message: `verify-ui-version: ${UI_PKG} not in package.json dependencies` };
  }

  for (const rel of DENO_ARTIFACTS) {
    if (fs.existsSync(join(root, rel))) {
      return { ok: false, message: `verify-ui-version: remove ${rel} (npm-only stack)` };
    }
  }

  if (fs.existsSync(join(root, 'node_modules', '.deno'))) {
    return { ok: false, message: 'verify-ui-version: remove node_modules/.deno and reinstall with npm' };
  }

  const uiPkgPath = join(root, 'node_modules', '@stevederico', 'skateboard-ui', 'package.json');
  if (!fs.existsSync(uiPkgPath)) {
    return { ok: false, message: `verify-ui-version: run npm install (${UI_PKG} missing)` };
  }

  const got = readManifest(uiPkgPath).version;
  if (got !== want) {
    return { ok: false, message: `verify-ui-version: want ${want}, installed ${got}` };
  }

  return { ok: true, message: `verify-ui-version: ${UI_PKG}@${got} ok` };
}
