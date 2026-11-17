import rule from './no-globals-package.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-globals-package', rule, {
  valid: [
    { code: "import { LAYERS } from './guardrails/eslint-plugin/layers.js';", filename: '.dependency-cruiser.js' },
    { code: "import { globalsList } from './globals-list.js';", filename: 'scripts/tool.js' },
  ],
  invalid: [
    { code: "import globals from 'globals';", filename: '.dependency-cruiser.js', errors: [{ messageId: 'banned' }] },
  ],
});
