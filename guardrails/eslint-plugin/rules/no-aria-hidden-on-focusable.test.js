import rule from './no-aria-hidden-on-focusable.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-aria-hidden-on-focusable', rule, {
  valid: [
    '<Button><Plus size={18} aria-hidden="true" />Add</Button>',
    '<TrendingUp className="size-4" aria-hidden="true" />',
    '<div aria-hidden="true" className="h-px bg-border" />',
    '<div tabIndex={-1} aria-hidden="true" />',
    '<Button aria-hidden="false">Ok</Button>',
    '<a aria-hidden="true">decor</a>',
  ],
  invalid: [
    { code: '<Button aria-hidden="true">Save</Button>', errors: [{ messageId: 'hiddenFocusable' }] },
    { code: '<a href="/x" aria-hidden>Link</a>', errors: [{ messageId: 'hiddenFocusable' }] },
    { code: '<div tabIndex={0} aria-hidden={true} />', errors: [{ messageId: 'hiddenFocusable' }] },
    { code: '<Input id="q" aria-hidden="true" />', errors: [{ messageId: 'hiddenFocusable' }] },
  ],
});
