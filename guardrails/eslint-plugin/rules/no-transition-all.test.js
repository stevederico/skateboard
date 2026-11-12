import rule from './no-transition-all.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-transition-all', rule, {
  valid: [
    '<div className="transition-colors duration-150 hover:bg-accent" />',
    'const c = cn("transition-opacity", "transition-transform");',
  ],
  invalid: [
    { code: '<div className="transition-all duration-300" />', errors: [{ messageId: 'all', data: { token: 'transition-all' } }] },
    { code: 'const c = cn("hover:transition-all");', errors: [{ messageId: 'all' }] },
    { code: '<div className="transition-[all]" />', errors: [{ messageId: 'all' }] },
  ],
});
