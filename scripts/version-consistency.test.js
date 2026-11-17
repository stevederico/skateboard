import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const readJSON = (rel) => JSON.parse(readFileSync(join(REPO, rel), 'utf8'));

const pkg = readJSON('package.json');
const IS_TEMPLATE = pkg.name === 'skateboard';

describe('version consistency', { skip: !IS_TEMPLATE }, () => {
  const { version } = pkg;

  it('skateboardVersion equals version', () => {
    assert.equal(pkg.skateboardVersion, version);
  });

  it('package-lock.json is synced to package.json version', () => {
    const lock = readJSON('package-lock.json');
    assert.equal(lock.version, version, 'lock root drifted — run `npm install --package-lock-only`');
    assert.equal(lock.packages?.['']?.version, version, 'lock self-entry drifted — run `npm install --package-lock-only`');
  });

  it('AGENTS.md Version block matches version', () => {
    const agents = readFileSync(join(REPO, 'AGENTS.md'), 'utf8');
    const match = agents.match(/^- skateboard@(\S+)$/m);
    assert.ok(match, 'AGENTS.md is missing its `- skateboard@<version>` line');
    assert.equal(match[1], version, 'AGENTS.md skateboard@ version drifted from package.json');
  });

  it('newest skateboard-changelog.md entry matches version', () => {
    const changelog = readFileSync(join(REPO, 'skateboard-changelog.md'), 'utf8');
    const match = changelog.match(/^\d+\.\d+\.\d+$/m);
    assert.ok(match, 'no version heading found in skateboard-changelog.md');
    assert.equal(match[0], version, 'newest changelog entry drifted from package.json');
  });
});
