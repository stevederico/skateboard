import rule from './no-emoji-icons.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-emoji-icons', rule, {
  valid: [
    '<Button><Lock size={18} aria-hidden="true" />Sign in</Button>',
    '<footer>© 2026 Acme™</footer>',
    'const flag = "🔐";',
    '<Feature icon="lock" />',
  ],
  invalid: [
    { code: '<span>🔐 Secure</span>', errors: [{ messageId: 'emoji', data: { emoji: '🔐' } }] },
    { code: '<Button>{"🚀"} Launch</Button>', errors: [{ messageId: 'emoji' }] },
    { code: '<Feature icon="⚡" title="Fast" />', errors: [{ messageId: 'emoji' }] },
  ],
});
