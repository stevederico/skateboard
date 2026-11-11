import rule from './filename-convention.js';
import { runRuleTests } from '../lib/ruleTester.js';

const code = 'export {};';

runRuleTests('filename-convention', rule, {
  valid: [
    { code, filename: 'src/components/HomeView.tsx' },
    { code, filename: 'src/components/HomeViewSkeleton.tsx' },
    { code, filename: 'src/components/HomeView.test.tsx' },
    { code, filename: 'src/main.tsx' },
    { code, filename: 'src/icons.ts' },
    { code, filename: 'src/types.d.ts' },
    { code, filename: 'src/formatMoney.test.ts' },
    { code, filename: 'scripts/update-skateboard.js' },
    { code, filename: 'scripts/verify-ui-version.ts' },
  ],
  invalid: [
    {
      code,
      filename: 'src/components/home-view.tsx',
      errors: [{ messageId: 'component', data: { file: 'src/components/home-view.tsx', renamed: 'HomeView.tsx' } }],
    },
    {
      code,
      filename: 'src/format-money.ts',
      errors: [{ messageId: 'module', data: { file: 'src/format-money.ts', renamed: 'formatMoney.ts' } }],
    },
    {
      code,
      filename: 'src/components/Legacy.jsx',
      errors: [{ messageId: 'javascript', data: { file: 'src/components/Legacy.jsx', renamed: 'Legacy.tsx' } }],
    },
    {
      code,
      filename: 'src/helpers.js',
      errors: [{ messageId: 'javascript', data: { file: 'src/helpers.js', renamed: 'helpers.ts' } }],
    },
  ],
});
