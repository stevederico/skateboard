import rule from './no-raw-color-classes.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-raw-color-classes', rule, {
  valid: [
    '<div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4" />',
    '<div className="h-px bg-border" />',
    '<p className="text-muted-foreground text-destructive bg-app text-sm" />',
    '<div className="bg-background text-foreground border-border ring-ring bg-accent" />',
    'const c = cn("text-2xl font-semibold tabular-nums @[250px]/card:text-3xl");',
    'const label = "bg-white";',
  ],
  invalid: [
    {
      code: '<div className="bg-white p-4" />',
      errors: [{ messageId: 'raw', data: { token: 'bg-white', suggestion: 'bg-background' } }],
    },
    {
      code: '<p className="text-gray-500" />',
      errors: [{ messageId: 'raw', data: { token: 'text-gray-500', suggestion: 'text-muted-foreground' } }],
    },
    {
      code: '<p className="hover:bg-red-500" />',
      errors: [{ messageId: 'raw', data: { token: 'hover:bg-red-500', suggestion: 'bg-destructive' } }],
    },
    {
      code: '<div className="border border-zinc-200/50" />',
      errors: [{ messageId: 'raw', data: { token: 'border-zinc-200/50', suggestion: 'border-border' } }],
    },
    { code: 'const c = cn("from-blue-400", "text-green-600");', errors: [{ messageId: 'raw' }, { messageId: 'raw' }] },
    { code: '<div className="bg-[#fff]" />', errors: [{ messageId: 'raw' }] },
    { code: '<div className="text-[rgb(10,10,10)]" />', errors: [{ messageId: 'raw' }] },
    { code: '<div className="[--x:#ff0000] shadow-[0_0_0_1px_#abc]" />', errors: [{ messageId: 'raw' }, { messageId: 'raw' }] },
    { code: '<div className={isOn ? "bg-purple-500" : "bg-accent"} />', errors: [{ messageId: 'raw' }] },
  ],
});
