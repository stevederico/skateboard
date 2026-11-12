import rule from './no-deep-package-imports.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-deep-package-imports', rule, {
  valid: [
    "import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';",
    "import { Skeleton } from '@stevederico/skateboard-ui/ui/skeleton';",
    "import { createRoot } from 'react-dom/client';",
    { code: "export { Plus } from 'lucide-react';", filename: 'src/icons.ts' },
    "import { SectionCards } from './SectionCards';",
  ],
  invalid: [
    { code: "import Trash2 from 'lucide-react/dist/esm/icons/trash-2';", errors: [{ messageId: 'lucide', data: { source: 'lucide-react/dist/esm/icons/trash-2', hint: 'Trash2' } }] },
    { code: "import Plus from 'lucide-react/icons/plus';", errors: [{ messageId: 'lucide' }] },
    { code: "import { apiRequest } from '@stevederico/skateboard-ui/dist/components/core/Utilities.js';", errors: [{ messageId: 'dist' }] },
    { code: "import x from '../../node_modules/@stevederico/skateboard-ui/dist/index.js';", errors: [{ messageId: 'nodeModules' }] },
    { code: "import { RuleTester } from 'eslint/dist/rule-tester.js';", filename: 'scripts/tool.js', errors: [{ messageId: 'dist' }] },
  ],
});
