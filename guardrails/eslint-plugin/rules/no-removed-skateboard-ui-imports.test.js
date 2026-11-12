import rule from './no-removed-skateboard-ui-imports.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-removed-skateboard-ui-imports', rule, {
  valid: [
    "import { useSafeNavigate, showSidebar } from '@stevederico/skateboard-ui/Utilities';",
    "import { Plus } from '../icons';",
    "import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';",
  ],
  invalid: [
    { code: "import { Plus } from '@stevederico/skateboard-ui/icons';", errors: [{ messageId: 'icons' }] },
    { code: "import Plus from '@stevederico/skateboard-ui/icons/Plus';", errors: [{ messageId: 'icons' }] },
    { code: "import DynamicIcon from '@stevederico/skateboard-ui/DynamicIcon';", errors: [{ messageId: 'dynamicIcon' }] },
    {
      code: "import { useForm, setSidebarVisible, apiRequest } from '@stevederico/skateboard-ui/Utilities';",
      errors: [{ messageId: 'removedUtility' }, { messageId: 'removedUtility' }],
    },
  ],
});
