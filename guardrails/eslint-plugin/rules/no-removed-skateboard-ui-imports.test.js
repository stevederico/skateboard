import rule from './no-removed-skateboard-ui-imports.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-removed-skateboard-ui-imports', rule, {
  valid: [
    "import { useSafeNavigate, showSidebar } from '@stevederico/skateboard-ui/Utilities';",
    "import { Plus } from '../icons';",
    { code: "export { Plus } from '@stevederico/skateboard-ui/icons';", filename: 'src/icons.ts' },
    "import { Button } from '@stevederico/skateboard-ui/ui/button';",
    "import { cn } from '@stevederico/skateboard-ui/lib/utils';",
  ],
  invalid: [
    {
      code: "import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';",
      errors: [{ messageId: 'shadcn', data: { source: '@stevederico/skateboard-ui/shadcn/ui/button', replacement: '@stevederico/skateboard-ui/ui/button' } }],
    },
    {
      code: "import { cn } from '@stevederico/skateboard-ui/shadcn/lib/utils';",
      errors: [{ messageId: 'shadcn', data: { source: '@stevederico/skateboard-ui/shadcn/lib/utils', replacement: '@stevederico/skateboard-ui/lib/utils' } }],
    },
    {
      code: "import { useIsMobile } from '@stevederico/skateboard-ui/shadcn/hooks/use-mobile';",
      errors: [{ messageId: 'shadcn', data: { source: '@stevederico/skateboard-ui/shadcn/hooks/use-mobile', replacement: '@stevederico/skateboard-ui/hooks/use-mobile' } }],
    },
    { code: "import Plus from '@stevederico/skateboard-ui/icons/Plus';", errors: [{ messageId: 'icons' }] },
    { code: "import DynamicIcon from '@stevederico/skateboard-ui/DynamicIcon';", errors: [{ messageId: 'dynamicIcon' }] },
    {
      code: "import { useForm, setSidebarVisible, apiRequest } from '@stevederico/skateboard-ui/Utilities';",
      errors: [{ messageId: 'removedUtility' }, { messageId: 'removedUtility' }],
    },
  ],
});
