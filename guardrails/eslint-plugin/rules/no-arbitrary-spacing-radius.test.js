import rule from './no-arbitrary-spacing-radius.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-arbitrary-spacing-radius', rule, {
  valid: [
    '<div className="flex h-(--header-height) shrink-0 items-center px-4 lg:px-6" />',
    '<div className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl" />',
    '<div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:shadow-xs" />',
    '<button className="active:scale-[0.98] [&>svg]:size-3 rounded-lg p-4 gap-6" />',
    '<div className="w-[320px] max-w-[42rem]" />',
  ],
  invalid: [
    { code: '<div className="p-[16px]" />', errors: [{ messageId: 'arbitrary', data: { token: 'p-[16px]', suggestion: 'p-4' } }] },
    { code: '<div className="gap-[24px]" />', errors: [{ messageId: 'arbitrary', data: { token: 'gap-[24px]', suggestion: 'gap-6' } }] },
    { code: '<div className="md:-mt-[8px]" />', errors: [{ messageId: 'arbitrary', data: { token: 'md:-mt-[8px]', suggestion: '-mt-2' } }] },
    { code: '<div className="px-[1.5rem]" />', errors: [{ messageId: 'arbitrary', data: { token: 'px-[1.5rem]', suggestion: 'px-6' } }] },
    { code: '<div className="rounded-[12px]" />', errors: [{ messageId: 'arbitrary', data: { token: 'rounded-[12px]', suggestion: 'rounded-md or rounded-lg (radius design tokens)' } }] },
    { code: 'const c = cn("gap-x-[13px]", "rounded-tl-[3px]");', errors: [{ messageId: 'arbitrary' }, { messageId: 'arbitrary' }] },
  ],
});
