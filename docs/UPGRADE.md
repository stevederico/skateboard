# Upgrading a Skateboard App

Two ways to bring an existing app up to the latest skateboard template:

1. **Interactive** — from the app root: `node scripts/update-skateboard.js` (3-way merge, prompts per file).
2. **Agent-driven** — paste the prompt below into Claude Code from the app root and let it run the whole upgrade, including conflict resolution and verification.

4.17.0 replaces the Node/Hono backend with zero-crate Rust. The updater deletes `backend/server.ts`, adapters, and `backend/package.json`. Port any custom routes into `backend/src/routes.rs`. Frontend `src/` is unchanged.

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
   - If it prints "Already on latest" but backend/server.ts still exists (a previous updater
     stamped skateboardVersion without migrating), find the real prior version with
     `git log -p -- package.json | grep skateboardVersion` and re-run:
     node scripts/update-skateboard.js --yes --baseline <that-version>

4. RESOLVE CONFLICTS
   - Search the repo for "<<<<<<<" markers and resolve each one: keep the app's local
     behavior, adopt the template's new types/structure. Show me anything ambiguous.

5. INSTALL + VERIFY (all must pass before committing)
   - npm install   (never bypass the npm min-release-age filter)
   - npm run typecheck — frontend only. App src/*.jsx files are NOT typechecked; leave them.
   - npm run test — cargo test for the Rust backend plus frontend tests. Never change
     test expectations to make them pass; fix the code.
   - npm run start and `cd backend && cargo run` — smoke-test: app boots, sign-in works, one API round-trip succeeds.

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
- Apps that customized `backend/server.ts` must port those routes into `backend/src/routes.rs` after the updater deletes the Hono file.
