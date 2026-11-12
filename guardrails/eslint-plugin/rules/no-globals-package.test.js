import rule from './no-globals-package.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-globals-package', rule, {
  valid: [
    { code: "import plugin from './guardrails/eslint-plugin/index.js';", filename: 'eslint.config.js' },
    { code: "import { globalsList } from './globals-list.js';", filename: 'scripts/tool.js' },
  ],
  invalid: [
    { code: "import globals from 'globals';", filename: 'eslint.config.js', errors: [{ messageId: 'banned' }] },
  ],
});
