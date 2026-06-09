# Upgrading a Skateboard App

Two ways to bring an existing app up to the latest skateboard template:

1. **Interactive** — from the app root: `node scripts/update-skateboard.js` (3-way merge, prompts per file). **Warning:** after upgrading, `npm run typecheck` gates build/test — expect to annotate your custom backend code (see step 5 of the agent prompt for the typical fixes).
2. **Agent-driven** — paste the prompt below into Claude Code from the app root and let it run the whole upgrade, including conflict resolution and verification.

The 3.8.0 release converts the template to TypeScript. The updater migrates renamed files (`backend/server.js` → `backend/server.ts`, etc.) with a content-based 3-way merge, so local edits survive the rename. Your app's `src/` components stay `.jsx` — Vite handles mixed JS/TS.

## Agent Prompt

Copy everything in the block below into Claude Code from the app's root directory:

```text
Upgrade this skateboard app to the latest skateboard template. Follow these steps exactly:

1. PRECONDITIONS
   - Confirm this is a skateboard app: package.json has a "skateboardVersion" field. Stop if not.
   - Require a clean git tree (commit or stash anything pending), then create a branch: chore/skateboard-update.

2. GET THE LATEST UPDATER (it is self-describing and safe to overwrite)
   curl -fsSL https://raw.githubusercontent.com/stevederico/skateboard/master/scripts/update-skateboard.js -o scripts/update-skateboard.js

3. RUN IT
   node scripts/update-skateboard.js --yes
   - If it prints "Already on latest" but backend/server.js still exists (a previous updater
     stamped skateboardVersion without migrating), find the real prior version with
     `git log -p -- package.json | grep skateboardVersion` and re-run:
     node scripts/update-skateboard.js --yes --baseline <that-version>

4. RESOLVE CONFLICTS
   - Search the repo for "<<<<<<<" markers and resolve each one: keep the app's local
     behavior, adopt the template's new types/structure. Show me anything ambiguous.

5. INSTALL + VERIFY (all must pass before committing)
   - npm install   (never bypass the npm min-release-age filter)
   - npm run typecheck — fix errors. Typical causes in app-customized backend code:
     custom routes merged into server.ts need parameter/return annotations; relative
     backend imports need explicit .ts extensions; enums are forbidden (Node strip-types) —
     use string-literal unions. App src/*.jsx files are NOT typechecked; leave them.
   - npm run test — all backend tests must pass. Never change test expectations to make
     them pass; fix the code.
   - npm run start — smoke-test: app boots, sign-in works, one API round-trip succeeds.

6. COMMIT on the branch with a message describing the template version jump
   (old skateboardVersion → new). Do not push or merge without my approval.

Throughout: never touch src/constants.json, src/components/*, src/assets/styles.css,
backend/config.json, or .env files beyond what the updater itself merged.
```

## Notes

- The updater never touches app-owned files (`src/constants.json`, `src/components/*`, `src/main.jsx`, `src/assets/styles.css`, `backend/config.json`, `.env*`).
- skateboard-ui ≥3.10.0 ships its own TypeScript declarations, so the old `src/skateboard-ui.d.ts` shim is deleted on upgrade — a stale copy would shadow the package's real types.
- `--baseline <version>` forces the 3-way merge baseline when `skateboardVersion` is wrong or was stamped prematurely. It also skips the "Already on latest" early-exit, so you can re-sync an app whose version was stamped without the files actually migrating.
- If any file ends declined, conflicted, or errored, the updater does **not** stamp `skateboardVersion` — resolve the conflicts, then re-run with `--baseline <old-version>` to finish.
- Apps that customized `backend/server.js` heavily should expect a handful of conflict markers in `server.ts` — the merge is line-based and the TS conversion annotated most signatures.
