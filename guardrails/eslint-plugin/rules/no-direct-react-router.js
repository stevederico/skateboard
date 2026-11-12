import { createBannedImportRule, packages } from '../lib/bannedImports.js';

export default createBannedImportRule({
  description:
    'Apps must not depend on `react-router` / `react-router-dom` directly for shell navigation. Use `useSafeNavigate()` from `@stevederico/skateboard-ui/Utilities`.',
  source: 'AGENTS.md > Migrating 4.x -> 5.0 (step 12, Routing)',
  entries: [
    {
      match: packages(['react-router', 'react-router-dom', '@remix-run/router']),
      why:
        'skateboard-ui owns the router (it pins react-router 7.18.x for CVE-2026-55685 and vite.config.ts dedupes it). App imports bind to whatever copy resolves, can end up outside the shell\'s RouterProvider, and silently pin the app to a router version the shell did not choose.',
      fix:
        'navigate with `const navigate = useSafeNavigate();` from "@stevederico/skateboard-ui/Utilities" (`navigate("/app/projects")`), declare routes in src/main.tsx `appRoutes` (type `AppRoute` from "@stevederico/skateboard-ui/App"), and render links as `<Button onClick={() => navigate(...)}>`.',
    },
  ],
});
