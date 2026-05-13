# Migrate to Skateboard 3.0

Paste the prompt below into Claude Code (or any coding agent) from the root of your skateboard 2.x project.

---

```
Upgrade this skateboard project from 2.x to 3.0. Do not skip steps, do not guess — verify each change.

1. Read package.json. Confirm current skateboardVersion is 2.x. Update:
   - "@stevederico/skateboard-ui": "^3.0.0"
   - "react": "19.2.6"
   - "react-dom": "19.2.6"
   - "react-router": "7.15.0"   (NEW — required as direct dep, Deno does not hoist it)
   - "react-router-dom": "7.15.0"
   - bump "version" and "skateboardVersion" to 3.0.0

2. Read backend/package.json. Remove "pg" and "mongodb" from dependencies UNLESS this app actually uses them. Check by grepping: `grep -r "from 'pg'\|from 'mongodb'\|require('pg')\|require('mongodb')" backend/`. If used, keep them. If not, remove.

3. Grep src/ for these imports — they were removed in 3.0:
   - `@stevederico/skateboard-ui/DataTable`
   - `@stevederico/skateboard-ui/Chart` or `ChartAreaInteractive`
   - `@stevederico/skateboard-ui/shadcn/ui/sonner` or `Toaster` from skateboard-ui
   If found, tell the user — these need manual replacement (they were demo-only and are gone in 3.0).

4. Grep src/ for these — they're now optional peer deps (only install if imported):
   - `vaul` (Drawer is still bundled in skateboard-ui core, no action needed)
   - `embla-carousel-react`
   - `react-resizable-panels`
   - `recharts`
   For each one found in src/, add to package.json dependencies with the latest version pinned exact.

5. Read vite.config.js. Ensure resolve.dedupe includes both 'react-router-dom' AND 'react-router'. Add 'react-router' if missing.

6. Run `deno install` (or `npm install` if no deno). Then `npm run build`. If build fails, read the error and fix it — common issues:
   - Missing import → add to package.json per step 4
   - "X is not exported by Y" → check skateboard-ui 3.0 changelog, the export may have moved

7. Update CHANGELOG.md: add a "3.0.0" entry above the current top entry, with one line: "Upgrade to skateboard 3.0".

8. Report back: list every file you changed and confirm `npm run build` passed. Do NOT commit — leave that to the user.
```
