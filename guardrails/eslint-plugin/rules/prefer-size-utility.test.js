import rule from './prefer-size-utility.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('prefer-size-utility', rule, {
  valid: [
    '<Skeleton className="h-8 w-32" />',
    '<Skeleton className="h-4 w-24" />',
    '<div className="size-10 rounded-lg" />',
    '<div className="w-10 md:h-10" />',
  ],
  invalid: [
    {
      code: '<div className="w-10 h-10" />',
      errors: [{ messageId: 'size', data: { width: 'w-10', height: 'h-10', replacement: 'size-10' } }],
    },
    {
      code: 'const c = cn("md:w-full", "md:h-full");',
      errors: [{ messageId: 'size', data: { width: 'md:w-full', height: 'md:h-full', replacement: 'md:size-full' } }],
    },
  ],
});
