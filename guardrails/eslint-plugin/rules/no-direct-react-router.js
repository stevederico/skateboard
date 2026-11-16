import { createBannedImportRule, packages } from '../lib/bannedImports.js';

export default createBannedImportRule({
  description:
    "Never import `react-router` / `react-router-dom` (or `@react-router/*`). skateboard-ui 5.16+ vendors react-router: navigate with `useSafeNavigate()` from `@stevederico/skateboard-ui/Utilities`, and import any other router API from `@stevederico/skateboard-ui/router`.",
  source: 'AGENTS.md > Routing',
  entries: [
    {
      match: (source, pkg) => packages(['react-router', 'react-router-dom', '@remix-run/router'])(source, pkg) || source.startsWith('@react-router/'),
      why:
        'skateboard-ui ships exactly one router copy, its vendored react-router (5.16+), and react-router is not in package.json. A direct import either fails to resolve or loads a second router whose context the shell\'s routes and Outlet cannot see: hooks throw "may be used only in the context of a <Router>" and useSafeNavigate falls back to full page loads.',
      fix:
        'navigate with `const navigate = useSafeNavigate();` from "@stevederico/skateboard-ui/Utilities" (`navigate("/app/projects")`) and declare routes in src/main.tsx `appRoutes`. For other router APIs import the same names from the shell: `import { useParams, useSearchParams, Link } from "@stevederico/skateboard-ui/router";` (`react-router/dom` -> "@stevederico/skateboard-ui/router/dom"). Then remove react-router from package.json and from vite.config.ts `resolve.dedupe` / `optimizeDeps.include`.',
    },
  ],
});
