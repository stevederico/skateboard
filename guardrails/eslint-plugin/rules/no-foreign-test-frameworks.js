import { createBannedImportRule, packages } from '../lib/bannedImports.js';

/** Test runners and their assertion/mocking companions that replace node:test. */
const RUNNERS = ['jest', '@jest/globals', 'mocha', 'jasmine', 'jasmine-core', 'vitest', '@vitest/expect', '@vitest/spy', 'ava', 'tap', 'uvu'];

export default createBannedImportRule({
  description:
    "Frontend / scripts: Node's built-in test runner (`node --test`), never Jest, Mocha, or Jasmine. No vitest.",
  source: 'AGENTS.md > Testing Standards',
  entries: [
    {
      match: packages(RUNNERS),
      why:
        'the repo runs every JS test with `node --test` (see package.json "test:build") so there is no runner to install, configure, or keep in sync; a second framework\'s tests would never run in CI.',
      fix:
        'use `import { describe, it, beforeEach, afterEach, mock } from "node:test";` and `import assert from "node:assert/strict";`, then add the file to the `node --test` list in package.json.',
    },
  ],
});
