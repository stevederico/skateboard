import rule from './no-outline-none-without-focus-ring.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-outline-none-without-focus-ring', rule, {
  valid: [
    '<div className="outline-none focus-visible:ring-2 focus-visible:ring-ring" />',
    '<div className="focus:outline-none focus:ring-2" />',
    'const c = cn("outline-hidden", "focus-visible:border-ring");',
    '<div className="flex flex-col gap-3 rounded-xl border border-border p-6" />',
  ],
  invalid: [
    { code: '<div className="outline-none p-2" />', errors: [{ messageId: 'outline', data: { token: 'outline-none' } }] },
    { code: '<div className="focus:outline-none" />', errors: [{ messageId: 'outline', data: { token: 'focus:outline-none' } }] },
    { code: 'const c = cn("outline-hidden", "ring-2");', errors: [{ messageId: 'outline' }] },
    { code: '<div className="focus-visible:outline-none focus-visible:outline-0" />', errors: [{ messageId: 'outline' }, { messageId: 'outline' }] },
  ],
});
