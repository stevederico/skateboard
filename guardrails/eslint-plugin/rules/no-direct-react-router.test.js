import rule from './no-direct-react-router.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-direct-react-router', rule, {
  valid: [
    "import { useSafeNavigate } from '@stevederico/skateboard-ui/Utilities';",
    { code: "import type { AppRoute } from '@stevederico/skateboard-ui/App';", filename: 'src/main.tsx' },
  ],
  invalid: [
    { code: "import { useNavigate } from 'react-router';", errors: [{ messageId: 'banned' }] },
    { code: "import { Link } from 'react-router-dom';", errors: [{ messageId: 'banned' }] },
    { code: "import { createBrowserRouter } from 'react-router/dom';", filename: 'src/main.tsx', errors: [{ messageId: 'banned' }] },
  ],
});
