import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { verifyUiVersion, __setFsForTests } from './verify-ui-version.ts';

const ROOT = '/fake/project';
const UI_PKG = '@stevederico/skateboard-ui';

let pkgJson = {
  dependencies: { [UI_PKG]: '3.8.1' }
};
let uiPkgJson = { version: '3.8.1' };
const existingPaths = new Set([
  join(ROOT, 'package.json'),
  join(ROOT, 'node_modules', '@stevederico', 'skateboard-ui', 'package.json')
]);

// Inject an in-memory filesystem instead of mocking node:fs — closes over the live
// fixtures so beforeEach/it mutations take effect.
__setFsForTests({
  existsSync(path) {
    return existingPaths.has(path);
  },
  readFileSync(path) {
    if (path === join(ROOT, 'package.json')) {
      return JSON.stringify(pkgJson);
    }
    if (path === join(ROOT, 'node_modules', '@stevederico', 'skateboard-ui', 'package.json')) {
      return JSON.stringify(uiPkgJson);
    }
    throw new Error(`Unexpected readFileSync path: ${path}`);
  }
});

describe('verifyUiVersion', () => {
  beforeEach(() => {
    pkgJson = { dependencies: { [UI_PKG]: '3.8.1' } };
    uiPkgJson = { version: '3.8.1' };
    existingPaths.clear();
    existingPaths.add(join(ROOT, 'package.json'));
    existingPaths.add(join(ROOT, 'node_modules', '@stevederico', 'skateboard-ui', 'package.json'));
  });

  it('returns ok when installed version matches package.json', () => {
    const result = verifyUiVersion(ROOT);

    assert.equal(result.ok, true);
    assert.match(result.message, /3\.8\.1 ok/);
  });

  it('strips caret prefix from wanted version', () => {
    pkgJson = { dependencies: { [UI_PKG]: '^3.8.1' } };
    const result = verifyUiVersion(ROOT);

    assert.equal(result.ok, true);
  });

  it('reads version from devDependencies when dependencies is missing', () => {
    pkgJson = { devDependencies: { [UI_PKG]: '~3.8.1' } };
    const result = verifyUiVersion(ROOT);

    assert.equal(result.ok, true);
  });

  it('fails when skateboard-ui is not listed in package.json', () => {
    pkgJson = { dependencies: {} };
    const result = verifyUiVersion(ROOT);

    assert.equal(result.ok, false);
    assert.match(result.message, /not in package\.json dependencies/);
  });

  it('fails when deno.lock is present', () => {
    existingPaths.add(join(ROOT, 'deno.lock'));
    const result = verifyUiVersion(ROOT);

    assert.equal(result.ok, false);
    assert.match(result.message, /remove deno\.lock/);
  });

  it('fails when deno.json is present', () => {
    existingPaths.add(join(ROOT, 'deno.json'));
    const result = verifyUiVersion(ROOT);

    assert.equal(result.ok, false);
    assert.match(result.message, /remove deno\.json/);
  });

  it('fails when backend/deno.json is present', () => {
    existingPaths.add(join(ROOT, 'backend', 'deno.json'));
    const result = verifyUiVersion(ROOT);

    assert.equal(result.ok, false);
    assert.match(result.message, /remove backend\/deno\.json/);
  });

  it('fails when backend/deno.lock is present', () => {
    existingPaths.add(join(ROOT, 'backend', 'deno.lock'));
    const result = verifyUiVersion(ROOT);

    assert.equal(result.ok, false);
    assert.match(result.message, /remove backend\/deno\.lock/);
  });

  it('fails when node_modules/.deno exists', () => {
    existingPaths.add(join(ROOT, 'node_modules', '.deno'));
    const result = verifyUiVersion(ROOT);

    assert.equal(result.ok, false);
    assert.match(result.message, /remove node_modules\/\.deno/);
  });

  it('fails when skateboard-ui package is not installed', () => {
    existingPaths.delete(join(ROOT, 'node_modules', '@stevederico', 'skateboard-ui', 'package.json'));
    const result = verifyUiVersion(ROOT);

    assert.equal(result.ok, false);
    assert.match(result.message, /run npm install/);
  });

  it('fails when installed version does not match wanted version', () => {
    uiPkgJson = { version: '1.0.0' };
    const result = verifyUiVersion(ROOT);

    assert.equal(result.ok, false);
    assert.match(result.message, /want 3\.8\.1, installed 1\.0\.0/);
  });
});