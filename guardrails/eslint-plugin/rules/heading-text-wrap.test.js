import rule from './heading-text-wrap.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('heading-text-wrap', rule, {
  valid: [
    '<h1 className="text-heading-lg text-balance">Projects</h1>',
    '<h2 className={cn("text-heading-md", "text-pretty")}>Billing</h2>',
    '<h3 {...props} />',
    '<CardTitle>Revenue</CardTitle>',
  ],
  invalid: [
    { code: '<h1 className="text-heading-lg">Projects</h1>', errors: [{ messageId: 'noWrap', data: { tag: 'h1' } }] },
    { code: '<h2>Settings</h2>', errors: [{ messageId: 'noWrap' }] },
  ],
});
