import rule from './no-foreign-test-frameworks.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-foreign-test-frameworks', rule, {
  valid: [
    { code: "import { describe, it } from 'node:test';\nimport assert from 'node:assert/strict';", filename: 'scripts/tool.test.js' },
  ],
  invalid: [
    { code: "import { describe, it, expect } from 'vitest';", filename: 'src/x.test.ts', errors: [{ messageId: 'banned' }] },
    { code: "import { jest } from '@jest/globals';", filename: 'scripts/tool.test.js', errors: [{ messageId: 'banned' }] },
    { code: "import Mocha from 'mocha';", filename: 'scripts/tool.test.js', errors: [{ messageId: 'banned' }] },
    { code: "import jasmine from 'jasmine';", filename: 'scripts/tool.test.js', errors: [{ messageId: 'banned' }] },
  ],
});
