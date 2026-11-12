import rule from './ban-ts-comment.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('ban-ts-comment', rule, {
  valid: [
    '// @ts-expect-error -- upstream types omit the overrides prop (issue #12)\nconst x = 1;',
    '/* @ts-expect-error: lib.dom lacks the View Transitions API types */\nconst y = 2;',
    '// mentions ts-ignore in prose only\nconst z = 3;',
  ],
  invalid: [
    { code: '// @ts-ignore\nconst x: number = "a";', errors: [{ messageId: 'ignore' }] },
    { code: '// @ts-nocheck\nconst x = 1;', errors: [{ messageId: 'nocheck' }] },
    { code: '/* @ts-nocheck */\nconst x = 1;', errors: [{ messageId: 'nocheck' }] },
    { code: '// @ts-expect-error\nconst x: number = "a";', errors: [{ messageId: 'expectErrorReason' }] },
    { code: '// @ts-expect-error -- fix\nconst x: number = "a";', errors: [{ messageId: 'expectErrorReason' }] },
  ],
});
