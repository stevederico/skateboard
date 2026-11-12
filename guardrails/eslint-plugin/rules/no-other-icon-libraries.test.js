import rule from './no-other-icon-libraries.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-other-icon-libraries', rule, {
  valid: [
    "import { Plus } from '../icons';",
    { code: "export { Plus } from 'lucide-react';", filename: 'src/icons.ts' },
  ],
  invalid: [
    { code: "import { FaLock } from 'react-icons/fa';", errors: [{ messageId: 'banned' }] },
    { code: "import { IconLock } from '@tabler/icons-react';", errors: [{ messageId: 'banned' }] },
    { code: "import { LockClosedIcon } from '@heroicons/react/24/outline';", errors: [{ messageId: 'banned' }] },
    { code: "import { faLock } from '@fortawesome/free-solid-svg-icons';", errors: [{ messageId: 'banned' }] },
  ],
});
