# Upgrading a Skateboard App

Two ways to bring an existing app up to the latest skateboard template:

1. **Interactive** — from the app root: `node scripts/update-skateboard.js` (3-way merge, prompts per file).
2. **Agent-driven** — paste the prompt below into Claude Code from the app root and let it run the whole upgrade, including conflict resolution and verification.

**4.x → 5.0 is a breaking major.** Follow the full checklist in [`AGENTS.md` → Migrating 4.x → 5.0](../AGENTS.md#migrating-4x-50-exact-checklist) (icons, DynamicIcon, Vite/SWC, ui pin `5.0.0`, Rust backend). Do not only run the updater.

**5.6.0 — security, upgrade promptly.** Parser panics no longer kill HTTP
workers (`catch_unwind` around `handle_connection` plus a live-count drop
guard). Request reads have a 15s wall-clock budget and keep-alive idles 30s,
so a slowloris dribble cannot pin the pool. The Stripe worker queue is bounded
(full → 503); jobs that miss their 10s deadline are dropped instead of still
calling Stripe. `POST /api/checkout` only accepts `lookup_key` values listed
in `src/constants.json` `stripeProducts`.

**5.5.0 — security, upgrade promptly.** Fixes an unauthenticated remote DoS: a
`Transfer-Encoding: chunked` chunk size could overflow the body-size check
(release builds have overflow checks off), panicking the worker outside
`catch_unwind` — a handful of requests took every worker down and dropped the
listener until restart. Also fixes `X-Forwarded-For` trust: `TRUST_PROXY` is now
the **number of trusted proxy hops** rather than an on/off flag, and the client
IP is read Nth-from-last instead of leftmost. `TRUST_PROXY=1` keeps working
unchanged for a single proxy; set it to your real hop count if you run more, and
leave it unset when the process is exposed directly. Previously the leftmost hop
was client-supplied, so rotating the header bypassed both the auth rate limit and
the account lockout.

**5.4.0.** Pin `@stevederico/skateboard-ui@5.1.0`. Move legal bodies out of
`constants.json` into `src/legal.json` and pass `loadLegal: () => import('./legal.json')`
to `createSkateboardApp`, with `hasTermsOfService` / `hasPrivacyPolicy` / `hasEULA` /
`hasSubscriptionDetails` flags so footer links stay. New `SECURITY.md` and
`npm run test:docs`. PWA icons under `public/icons/` are small SVG/PNG + `og.png`.

**5.3.0.** Auth routes (`/api/signup`, `/api/signin`) now enforce a per-IP sliding
window (20 / 15 min). Set `TRUST_PROXY=1` only when a trusted reverse proxy sets
`X-Forwarded-For`. CSP `script-src` no longer allows `'unsafe-inline'` — the dark-mode
bootstrap lives at `/theme-init.js`. Stripe Checkout/Portal/webhook HTTP calls run on a
dedicated worker thread with a 10s timeout (504 on stall).

**5.2.0 deploy check.** With `NODE_ENV=production` the backend now refuses to start unless
`JWT_SECRET` is set, at least 32 characters, and not the `.env.example` placeholder. Rotate any
shorter production secret *before* deploying — the process exits with the reason on stderr.
`/api/health` also answers 503 when SQLite is unreachable, so container healthchecks that
previously passed on a broken database will now fail (intended).

4.17.0 replaced the Node/Hono backend with zero-crate Rust. The updater deletes `backend/server.ts`, adapters, and `backend/package.json`. Port any custom routes into `backend/src/routes.rs`.

## Agent Prompt (4.x → 5.0)

Copy everything in the block below into Claude Code from the app's root directory:

```text
Upgrade this skateboard app from 4.x to skateboard 5.0.0 + @stevederico/skateboard-ui@5.0.0.

Follow AGENTS.md section "Migrating 4.x → 5.0 (exact checklist)" in the skateboard reference repo exactly:
https://raw.githubusercontent.com/stevederico/skateboard/master/AGENTS.md

Summary of required work (do all of it):
1. Clean git tree; branch chore/skateboard-5.
2. Refresh scripts/update-skateboard.js from skateboard master; run with --yes (use --baseline if needed).
3. Resolve conflicts; ensure zero-crate Rust backend (empty [dependencies]); port any Hono routes to backend/src/routes.rs.
4. npm install @stevederico/skateboard-ui@5.0.0 --save-exact && npm run verify:ui.
5. Rewrite all @stevederico/skateboard-ui/icons and DynamicIcon imports to named lucide-react imports; add lucide-react dependency if missing.
6. Keep @stevederico/skateboard-ui/shadcn/ui/* imports (exports remap in 5.0).
7. Drop @vitejs/plugin-react-swc; let JSX come from tsconfig ("jsx": "react-jsx"); drop vite --force and optimizeDeps.force.
8. Drop test:coverage* scripts if present.
9. npm run typecheck && npm run test && (cd backend && cargo test --locked). Smoke sign-in + one API call.
10. Set version and skateboardVersion to 5.0.0 (equal). Update app CHANGELOG. Commit on the branch; do not push without approval.

Never touch src/constants.json, backend/config.json, or .env beyond what the updater merged. Prefer app-side AGENTS.md on conflicts.
```

## Notes

- The updater never touches app-owned files (`src/constants.json`, `src/components/*`, `src/main.tsx`, `src/assets/styles.css`, `backend/config.json`, `.env*`). Icon **rewrites inside** `src/components/*` are still required for 5.0 — do those manually (updater will not rewrite app imports).
- skateboard-ui ≥3.10.0 ships its own TypeScript declarations, so the old `src/skateboard-ui.d.ts` shim is deleted on upgrade — a stale copy would shadow the package's real types.
- `--baseline <version>` forces the 3-way merge baseline when `skateboardVersion` is wrong or was stamped prematurely. It also skips the "Already on latest" early-exit, so you can re-sync an app whose version was stamped without the files actually migrating.
- If any file ends declined, conflicted, or errored, the updater does **not** stamp `skateboardVersion` — resolve the conflicts, then re-run with `--baseline <old-version>` to finish.
- Apps that customized `backend/server.ts` must port those routes into `backend/src/routes.rs` after the updater deletes the Hono file.
