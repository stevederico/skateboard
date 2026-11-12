import rule from './no-non-null-assertion.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-non-null-assertion', rule, {
  valid: [
    'const root = document.getElementById("root"); if (!root) throw new Error("missing #root");',
    'const email = user?.email ?? "";',
    'const isDone = !pending;',
  ],
  invalid: [
    { code: 'const root = document.getElementById("root")!;', errors: [{ messageId: 'nonNull' }] },
    { code: 'const n = user!.name;', errors: [{ messageId: 'nonNull' }] },
    { code: 'const first = items[0]!;', errors: [{ messageId: 'nonNull' }] },
  ],
});
