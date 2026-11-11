import rule from './no-space-utilities.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-space-utilities', rule, {
  valid: [
    '<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6" />',
    '<div className="whitespace-nowrap tracking-tight" />',
  ],
  invalid: [
    { code: '<div className="space-y-4" />', errors: [{ messageId: 'space', data: { token: 'space-y-4', fix: 'flex flex-col gap-4' } }] },
    { code: '<div className="md:space-x-2" />', errors: [{ messageId: 'space', data: { token: 'md:space-x-2', fix: 'flex gap-2' } }] },
    { code: 'const c = cn("-space-x-1");', errors: [{ messageId: 'space' }] },
    { code: '<div className="space-y-reverse" />', errors: [{ messageId: 'space', data: { token: 'space-y-reverse', fix: 'flex flex-col-reverse gap-N' } }] },
  ],
});
