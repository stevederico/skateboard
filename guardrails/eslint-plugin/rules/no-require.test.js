import rule from './no-require.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-require', rule, {
  valid: [
    { code: "import { readFileSync } from 'node:fs';", filename: 'scripts/tool.js' },
    { code: "const mod = await import('./legal.json');", filename: 'src/main.tsx' },
    { code: 'const exportsList = [];', filename: 'scripts/tool.js' },
  ],
  invalid: [
    { code: "const fs = require('node:fs');", filename: 'scripts/tool.js', errors: [{ messageId: 'require' }] },
    { code: "const p = require.resolve('vite');", filename: 'scripts/tool.js', errors: [{ messageId: 'require' }] },
    { code: 'module.exports = { run };', filename: 'scripts/tool.js', errors: [{ messageId: 'moduleExports' }] },
    { code: 'exports.run = run;', filename: 'scripts/tool.js', errors: [{ messageId: 'moduleExports' }] },
    { code: "import fs = require('node:fs');", filename: 'scripts/tool.ts', errors: [{ messageId: 'importEquals' }] },
  ],
});
