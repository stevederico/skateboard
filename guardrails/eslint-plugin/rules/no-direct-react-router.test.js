import rule from './no-direct-react-router.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-direct-react-router', rule, {
  valid: [
    "import { useSafeNavigate } from '@stevederico/skateboard-ui/Utilities';",
    { code: "import type { AppRoute } from '@stevederico/skateboard-ui/App';", filename: 'src/main.tsx' },
    "import { useParams, useSearchParams } from '@stevederico/skateboard-ui/router';",
    { code: "import { RouterProvider } from '@stevederico/skateboard-ui/router/dom';", filename: 'src/main.tsx' },
  ],
  invalid: [
    { code: "import { useNavigate } from 'react-router';", errors: [{ messageId: 'banned' }] },
    { code: "import { Link } from 'react-router-dom';", errors: [{ messageId: 'banned' }] },
    { code: "import { createBrowserRouter } from 'react-router/dom';", filename: 'src/main.tsx', errors: [{ messageId: 'banned' }] },
    { code: "import type { Location } from 'react-router';", errors: [{ messageId: 'banned' }] },
    { code: "const rr = await import('react-router');", errors: [{ messageId: 'banned' }] },
    { code: "import { reactRouter } from '@react-router/dev/vite';", filename: 'vite.config.ts', errors: [{ messageId: 'banned' }] },
  ],
});
