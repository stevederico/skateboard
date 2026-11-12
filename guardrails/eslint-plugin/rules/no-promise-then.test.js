import rule from './no-promise-then.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-promise-then', rule, {
  valid: [
    'async function load() { const res = await fetch("/x"); return res.json(); }',
    "const loadLegal = () => import('./legal.json');",
    'const thenable = { then: 1 };',
  ],
  invalid: [
    { code: 'fetch("/x").then((r) => r.json());', errors: [{ messageId: 'then' }] },
    { code: 'apiRequest("/deals").then(setDeals).catch(console.error);', errors: [{ messageId: 'then' }] },
    { code: "lazy(() => import('./A').then((m) => ({ default: m.A })));", errors: [{ messageId: 'then' }] },
  ],
});
