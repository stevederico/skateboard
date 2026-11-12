import rule from './no-dark-variant.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-dark-variant', rule, {
  valid: [
    '<div className="flex flex-col gap-3 rounded-xl border border-border p-6" />',
    '<div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card grid grid-cols-1" />',
    'const c = cn("bg-background text-foreground", isActive && "bg-accent");',
    '<div className="darkness" />',
  ],
  invalid: [
    { code: '<div className="bg-white dark:bg-gray-800" />', errors: [{ messageId: 'dark', data: { token: 'dark:bg-gray-800' } }] },
    { code: 'const c = cn("p-4", isOpen && "dark:hover:text-white");', errors: [{ messageId: 'dark' }] },
    { code: 'const v = cva("p-2", { variants: { tone: { muted: "dark:bg-zinc-900" } } });', errors: [{ messageId: 'dark' }] },
  ],
});
