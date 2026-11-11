import rule from './motion-safe-animations.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('motion-safe-animations', rule, {
  valid: [
    '<div className="motion-safe:animate-spin" />',
    '<div className="animate-pulse motion-reduce:animate-none" />',
    '<div className="animate-none" />',
    '<div className="flex flex-col gap-3 rounded-xl border border-border p-6" />',
  ],
  invalid: [
    { code: '<div className="animate-spin" />', errors: [{ messageId: 'motion', data: { token: 'animate-spin', utility: 'animate-spin' } }] },
    { code: 'const c = cn("hover:animate-bounce");', errors: [{ messageId: 'motion', data: { token: 'hover:animate-bounce', utility: 'animate-bounce' } }] },
  ],
});
