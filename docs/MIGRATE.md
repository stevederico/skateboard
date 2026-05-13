# Migrate to Latest Skateboard

Paste the prompt below into Claude Code (or any coding agent) from the root of your skateboard 2.x or 3.0.x project. It upgrades to the current latest (3.1.2).

---

```
Upgrade this skateboard project to the latest version (3.1.2). Do not skip steps, do not guess — verify each change.

1. Read package.json. Note the current skateboardVersion. Update dependencies to these exact pins:
   - "@stevederico/skateboard-ui": "^3.0.0"
   - "react": "19.2.6"
   - "react-dom": "19.2.6"
   - "react-router": "7.15.0"      (required as direct dep — Deno does not hoist it)
   - "react-router-dom": "7.15.0"
   Update devDependencies to these exact pins:
   - "@tailwindcss/vite": "4.3.0"
   - "@vitejs/plugin-react-swc": "4.3.0"
   - "tailwindcss": "4.3.0"
   - "vite": "7.3.3"
   Bump "version" and "skateboardVersion" to 3.1.2.

2. Read backend/package.json. Remove "pg" and "mongodb" from dependencies UNLESS this app actually uses them. Check by grepping: `grep -r "from 'pg'\|from 'mongodb'\|require('pg')\|require('mongodb')" backend/`. If used, keep them. If not, remove.

3. Grep src/ for these imports — they were removed in 3.0:
   - `@stevederico/skateboard-ui/DataTable`
   - `@stevederico/skateboard-ui/Chart` or `ChartAreaInteractive`
   - `@stevederico/skateboard-ui/shadcn/ui/sonner` or `Toaster` from skateboard-ui
   If found, tell the user — these need manual replacement (they were demo-only and are gone in 3.0+).

4. Grep src/ for these — they're now optional peer deps (only install if imported):
   - `embla-carousel-react`
   - `react-resizable-panels`
   - `recharts`
   For each one found in src/, add to package.json dependencies with the latest version pinned exact.

5. Grep src/ for `from "lucide-react"`. If found, rewrite all such imports to `from "@stevederico/skateboard-ui/icons"` and remove `lucide-react` from package.json dependencies — icons are vendored in skateboard-ui 3.0+.

6. Read vite.config.js. Ensure resolve.dedupe includes both 'react-router-dom' AND 'react-router'. Add 'react-router' if missing.

7. (Optional, 3.1.0+) If the user wants the refined landing variant, copy `src/components/LandingSpecSheet.jsx` from the skateboard reference repo (https://github.com/stevederico/skateboard) and wire it in `src/main.jsx` via `createSkateboardApp`'s `landingPage` prop. Skip if the user prefers the default LandingView.

8. Run `deno install` (or `npm install` if no deno). Then `npm run build`. If build fails, read the error and fix it — common issues:
   - Missing import → add to package.json per step 4
   - "X is not exported by Y" → check skateboard-ui 3.0+ changelog, the export may have moved
   - "failed to resolve import react-router/dom" → step 1 was skipped, add react-router as a direct dep

9. Update CHANGELOG.md: add a "3.1.2" entry above the current top entry, with one line: "Upgrade to skateboard 3.1.2".

10. Report back: list every file you changed and confirm `npm run build` passed. Do NOT commit — leave that to the user.
```
