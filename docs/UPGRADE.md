# Upgrading a Skateboard App

Two ways to bring an existing app up to the latest skateboard template:

1. **Interactive** — from the app root: `node scripts/update-skateboard.js` (3-way merge, prompts per file).
2. **Agent-driven** — paste the prompt below into Claude Code from the app root and let it run the whole upgrade, including conflict resolution and verification.

**4.x → 5.0 is a breaking major.** Follow the full checklist in [`AGENTS.md` → Migrating 4.x → 5.0](../AGENTS.md#migrating-4x-50-exact-checklist) (icons, DynamicIcon, Vite/SWC, ui pin `5.0.0`, Rust backend). Do not only run the updater.

**5.16.0 — boundary analyzer + runtime verify.** No runtime change. The
updater now syncs `.dependency-cruiser.js` and `guardrails/verify/`, the nested
`guardrails/package.json` gains dependency-cruiser and `@playwright/test`
(re-run `npm run guardrails:install`), and two scripts are added. `npm run
depcruise` checks the whole import graph against the same layer table as the
lint rule, plus cycles, orphans, dev-only and undeclared packages; each message
names the fix. `npm run verify` boots the Vite frontend and the Rust backend
and clicks through the app in Chromium (first run:
`cd guardrails && npx --no-install playwright install chromium`); its flows
assert the template's views and `src/constants.json` names, so merge
`guardrails/verify/verify.e2e.js` with your app's own pages. Add
`verify-artifacts/` to `.gitignore` if the updater did not. The workflows
(`.github/workflows/ci.yml` job `guardrails`, `verify.yml`) are not synced;
copy them from the reference repo.

**5.15.0 — guardrails lint + icon funnel.** No runtime change. The
updater now syncs `eslint.config.js` and `guardrails/` (a local ESLint plugin
whose rules mirror AGENTS.md; ESLint and its TypeScript parser live in the
nested `guardrails/package.json`, never in root deps) and adds the
`guardrails:install`, `lint` and `test:guardrails` scripts. Run
`npm run guardrails:install && npm run lint` and follow each message. The one
most apps hit: `lucide-react` may only be imported by `src/icons.ts` (app-owned,
so create it): list the icons the app uses as
`export { Plus, Trash2 } from 'lucide-react';` and change component imports to
`import { Plus } from '../icons'`. Lint is not part of `npm run test`.

**5.14.4 — base images pinned by digest.** No runtime change: the
`Dockerfile` pins node, rust and debian by multi-arch digest (each at least
7 days old) and sets `ENV RUSTUP_TOOLCHAIN=1.99.1`. Apps can copy the `FROM`
lines and the toolchain line.

**5.14.3 — skateboard-ui 5.11.4.** `isSubscriber()` now reads
`POST /usage` `{"operation":"check"}` (the template backend has no
`GET /isSubscriber` route, so it always returned false). Apps only bump the pin.

**5.14.2 — CI actions on v5.** No runtime change: `.github/workflows/ci.yml`
pins `actions/checkout` v5.1.0 and `actions/setup-node` v5.0.0 (Node 24
runtime) by commit SHA. Apps with a copy of this workflow can make the same
edits.

**5.14.1 — CI hardening.** No runtime change: `.github/workflows/ci.yml` pins
every action to a commit SHA, sets `permissions: contents: read` and checks out
with `persist-credentials: false`. Apps with a copy of this workflow can make
the same edits.

**5.14.0 — trialing counts as paid on the backend.** `is_subscriber` in
`backend/src/routes.rs` now accepts `PAID_STATUSES = ["active", "trialing"]`
(the period-end check is unchanged), so `/api/usage` treats a Stripe trial as
unlimited, matching skateboard-ui's `isPaidStatus` from 5.13.1. Before this, a
trial user saw the paid UI but hit the free-tier 429. Apps with their own
`is_subscriber` copy should make the same one-line change.

**5.13.2 — skateboard-ui 5.11.3.** No runtime change: skateboard-ui's
publish workflow pins its actions and npm, and its harness adds nested submenu
and closed-menu Escape tests. Apps only bump the pin.

**5.13.1 — skateboard-ui 5.11.2.** A `trialing` subscription counts as paid
(new `isPaidStatus(status)` export), so trial users no longer see the upgrade
sheet or show as Free; DropdownMenu closes on an Escape pressed right after
opening; skateboard-ui's `styles.css` scans only its own `dist` for Tailwind
classes.

**5.13.0 — skateboard-ui 5.11.0.** Tab bar items, the theme toggle and
Settings Sign Out have 44px tap targets; Sheet content scrolls on touch and
Sheet takes an optional `onUserClose`; the auth overlay opens on Sign Up
unless this device signed in before; Sign Up shows the server's error message
and suggests a fix for a mistyped mail domain. Sign Up also asks
`GET /signup/options` for an optional Cloudflare Turnstile site key; the
template backend has no such route, so the 404 is ignored and no widget shows.

**5.12.0 — Stripe webhook fixes, upgrade promptly.** `customer.subscription.*`
events re-fetch the subscription from Stripe instead of trusting the event
snapshot, so a late `created` (status `incomplete`) no longer re-locks a user
who just paid. A new `Users.subscription_id` column (added automatically on
startup) records the current subscription, and an event for another,
non-paying subscription (an old plan's `deleted`) is ignored instead of
re-locking a user who resubscribed. A database error while applying an event
now answers 500 without marking the event processed, so Stripe retries it.
Apps that changed `process_webhook` or `apply_sub_patch` must merge by hand;
code that builds a `Subscription` needs the new `subscription_id` field.

**5.10.0 — libSQL startup retry.** With `LIBSQL_URL` set, startup keeps
retrying the shared server for up to 3 minutes (1s doubling to 15s) instead of
exiting on the first failure. When a whole project restarts at once, the
database's private hostname can resolve late, and exiting used up the restart
policy and left the app down.

**5.9.0 — CSRF survives restarts.** CSRF tokens are now
`<issued ms>.<HMAC>` signed with `JWT_SECRET` instead of kept in an in-memory
store, so a deploy or restart no longer makes the first write after it fail
with 403, and every replica accepts the same token. `GET /api/me` re-mints the
cookie when it is missing, expired, or from the old scheme. `CsrfStore`,
`AppState.csrf` and the hourly `csrf-cleanup` job are gone; drop any app code
that touched them.

**5.7.1 — skateboard-ui 5.2.2.** `useListData(url, sort, { live: true })`
refetches quietly every minute while the page is visible; a page opened
before a deploy reloads once instead of failing to import a chunk; dark mode
has stronger card, border and muted-text contrast; Header titles are larger
and bolder.

**5.7.0 — shared libSQL, theme fix.** Set `LIBSQL_URL` to run against a
shared libSQL (`sqld`) server over Hrana HTTP instead of the local SQLite
file; the namespace is `config.json` `database.db`. The Hrana client replaces
its stream baton after every response, including errors, so a failed
statement inside a transaction cannot leave a pooled connection sending a
spent baton. `public/theme-init.js` now treats a saved `system` theme as the
system setting instead of light.

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
5. Rewrite all @stevederico/skateboard-ui/icons and DynamicIcon imports to named imports from src/icons.ts (create it: an explicit `export { X } from 'lucide-react'` list; it is the only file that imports lucide-react); add lucide-react dependency if missing.
6. Keep @stevederico/skateboard-ui/shadcn/ui/* imports (exports remap in 5.0).
7. Drop @vitejs/plugin-react-swc; let JSX come from tsconfig ("jsx": "react-jsx"); drop vite --force and optimizeDeps.force.
8. Drop test:coverage* scripts if present.
9. npm run typecheck && npm run test && (cd backend && cargo test --locked). Then npm run guardrails:install && npm run lint and fix every report (each message names the fix). Smoke sign-in + one API call.
10. Set version and skateboardVersion to 5.0.0 (equal). Update app CHANGELOG. Commit on the branch; do not push without approval.

Never touch src/constants.json, backend/config.json, or .env beyond what the updater merged. Prefer app-side AGENTS.md on conflicts.
```

## Notes

- The updater never touches app-owned files (`src/constants.json`, `src/components/*`, `src/main.tsx`, `src/icons.ts`, `src/assets/styles.css`, `backend/config.json`, `.env*`). Icon **rewrites inside** `src/components/*` are still required for 5.0 — do those manually (updater will not rewrite app imports); `npm run lint` lists every one.
- skateboard-ui ≥3.10.0 ships its own TypeScript declarations, so the old `src/skateboard-ui.d.ts` shim is deleted on upgrade — a stale copy would shadow the package's real types.
- `--baseline <version>` forces the 3-way merge baseline when `skateboardVersion` is wrong or was stamped prematurely. It also skips the "Already on latest" early-exit, so you can re-sync an app whose version was stamped without the files actually migrating.
- If any file ends declined, conflicted, or errored, the updater does **not** stamp `skateboardVersion` — resolve the conflicts, then re-run with `--baseline <old-version>` to finish.
- Apps that customized `backend/server.ts` must port those routes into `backend/src/routes.rs` after the updater deletes the Hono file.
