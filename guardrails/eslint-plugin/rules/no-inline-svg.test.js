import rule from './no-inline-svg.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-inline-svg', rule, {
  valid: [
    '<TrendingUp className="size-4" aria-hidden="true" />',
    { code: 'export const Logo = () => <svg viewBox="0 0 24 24"><path d="M0 0" /></svg>;', filename: 'src/icons.tsx' },
  ],
  invalid: [
    { code: '<svg viewBox="0 0 24 24"><path d="M0 0" /></svg>', errors: [{ messageId: 'inlineSvg' }] },
    { code: 'const Blob = () => <svg className="absolute" />;', filename: 'src/main.tsx', errors: [{ messageId: 'inlineSvg' }] },
  ],
});
