import rule from './test-file-naming.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('test-file-naming', rule, {
  valid: [
    { code: 'export {};', filename: 'scripts/version-consistency.test.js' },
    { code: 'export {};', filename: 'src/components/HomeView.test.tsx' },
    { code: 'export {};', filename: 'src/inspect.ts' },
  ],
  invalid: [
    {
      code: 'export {};',
      filename: 'scripts/verify.spec.js',
      errors: [{ messageId: 'spec', data: { name: 'verify.spec.js', renamed: 'verify.test.js' } }],
    },
    {
      code: 'export {};',
      filename: 'src/components/HomeView.spec.tsx',
      errors: [{ messageId: 'spec', data: { name: 'HomeView.spec.tsx', renamed: 'HomeView.test.tsx' } }],
    },
  ],
});
