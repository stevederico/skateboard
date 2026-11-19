# AGENTS.md

Project guidance for Claude Code and AI agents working with this repository.
This file is the source of truth; `CLAUDE.md` is a symlink to it.

## Development Commands

**Primary Development:**
```bash
npm run start          # Frontend only (Vite on :5173)
npm run front          # Same as start
cd backend && cargo run   # Backend on :8000
```

**Ports:** `SKATEBOARD_FRONTEND_PORT` (default 5173) and `SKATEBOARD_BACKEND_PORT` (default 8000) move the whole dev setup, so several copies of an app can run side by side. Export both in the shell that runs the frontend and the backend:

```bash
export SKATEBOARD_FRONTEND_PORT=5301 SKATEBOARD_BACKEND_PORT=8301
npm run start                # Vite on :5301, strictly (fails rather than moving to another port)
cd backend && cargo run      # backend on :8301; allows CORS from :5301
npm run verify               # needs neither: verify serves the built app on a free port of its own
```

- Vite: `server.port` and `strictPort` come from `SKATEBOARD_FRONTEND_PORT`; `devBackendPortPlugin` (dev server only) rewrites `devBackendURL` in `src/constants.json` to `http://localhost:$SKATEBOARD_BACKEND_PORT/api`. Builds never read either variable.
- Backend: listens on `SKATEBOARD_BACKEND_PORT`, else `PORT`, else 8000 (the explicit variable wins over a `PORT` in `backend/.env`). Without `CORS_ORIGINS` it allows `localhost` and `127.0.0.1` on the frontend and backend ports.
- A value that is not a port from 1 to 65535 stops Vite and verify with a message naming the variable.

**Build Commands:**
```bash
npm run build          # Frontend typecheck + Vite production build
npm run prod           # Same as build
npm install-all        # Install frontend dependencies
cd backend && cargo build --release
```

**Testing:**
```bash
npm run test           # Frontend typecheck + script tests (no vitest)
cd backend && cargo test --locked
cd backend && cargo fmt --check   # must pass: CI and the factory pre-push check it
```

`npm install` runs `postinstall`, which points `core.hooksPath` at `.githooks/` only when no hooksPath is set at any level (repo, global or system). A global hooksPath, such as a machine-wide hook set, stays in charge; it runs `.githooks/<hook>` itself if it chains to the repo's hooks.

**Guardrails (lint, boundaries, runtime verify):**
```bash
npm run guardrails:install   # once: dependency-cruiser (+ TypeScript 5) into guardrails/
npm run lint                 # oxlint + the local guardrails plugin (see Guardrails)
npm run test:guardrails      # rule tests (each case runs through oxlint)
npm run depcruise            # whole-graph import boundaries (.dependency-cruiser.js)
npm run verify               # builds the app, serves it from the backend, clicks through it with agent-browser
```

`oxlint` and `agent-browser` are global CLIs, not project dependencies: `mise use -g npm:oxlint npm:agent-browser` (or `npm install -g oxlint agent-browser`).

## Code Standards

### Documentation Requirements

**CRITICAL: Documentation must always match code.**

**No comments in code, doc comments included (no JSDoc `/** */`).** Comments go stale, nobody reads them, and they give an agent a place to justify a workaround instead of fixing the cause. Put the contract in a clear name, the TypeScript types, a test, or a lint rule.

- New and edited code adds no comments. The template itself carries none (since 5.26.0); app code's existing comments go when someone edits the code around them.
- What a comment used to explain lives in a name (`DIFF_EXIT_FILES_DIFFER`), a test, or **Invariants** below.
- Allowed: lint disable directives (`// oxlint-disable-next-line skateboard/<rule> -- <reason>`), `yagni:` markers (a deliberate shortcut with its ceiling and upgrade path), license headers, and shebangs.
- Never leave commented-out code; git remembers.

When making ANY code changes, you MUST update:
- README.md if user-facing behavior changes
- CLAUDE.md if architecture/patterns change
- API docs if endpoints change
- the changelog for all changes (`skateboard-changelog.md` in this repo; `CHANGELOG.md` in apps — see commit protocol)

**Version & dependency bumps MUST propagate to every doc that names them (no exceptions):**
- Bumping a version in `package.json` (the app `version`, `skateboardVersion`, or any dependency) is NOT done until you have grepped the docs for the old value and updated every hit: `README.md` (the Technology/Version table, version floors), `docs/GUIDE.md`, `docs/UPGRADE.md`, and the AGENTS.md "Version" block.
- `version` and `skateboardVersion` in `package.json` must always be equal — a stale `skateboardVersion` is a lie.
- **Never hardcode dependency pins inside prose/docs.** Embedded "upgrade to X" prompts with literal pins rot every release. Reference the current pins from `package.json` / the reference repo instead, or point at the version-agnostic updater (`scripts/update-skateboard.js`).
- Quick audit before committing a bump: `grep -rn "<old-version>" README.md docs/ AGENTS.md` must return nothing.

**Before committing:**
1. Check that names and types still say what the code does, and that no comments were added
2. Verify examples in docs still work with changes
3. If any version changed, run the grep audit above and confirm zero stale hits

**Out-of-date documentation is worse than no documentation.**

### Changelog Formatting

- `- item` (dash prefix) = incomplete
- `item` (no dash, no space) = completed

### Naming Conventions

- Functions: `camelCase` verbs (`fetchUser`, `handleClick`)
- Components: `PascalCase` (`HomeView`, `DealCard`)
- Constants: `UPPER_SNAKE_CASE` for true constants, `camelCase` for config objects
- Files: components as `PascalCase.tsx`, everything else `camelCase.ts`
- Boolean variables prefixed with `is`, `has`, `should` (`isLoading`, `hasAccess`)

### Function Design

- Max ~50 lines per function — if longer, break it up
- Single responsibility — one function does one thing
- Early returns over nested conditionals
- No magic numbers — extract to named constants

### Code Organization

- Imports ordered: external packages → internal modules → relative paths
- Group related functions together in a file
- Keep components focused — if a component file exceeds ~150 lines, consider splitting

### TypeScript Style

- TypeScript everywhere — `.ts` / `.tsx` files, `strict` mode always on
- No build-step typechecking: `npm run typecheck` runs `tsc -p tsconfig.json` (`noEmit` is set in tsconfig) for the frontend; it gates `build`, `prod`, and `test`. Backend is `cargo test`.
- `@types` packages are dev-only dependencies (`@types/react`, `@types/react-dom`). No `@types/node`: `tsconfig.json` checks only `src/` (browser code); Node files (`vite.config.ts`, `vite.plugins.ts`, `scripts/`) run under Node's own type stripping and are not in its `include`. Add `@types/node` back only if `src/` ever needs Node types
- Prefer `const` over `let` — use `let` only when reassigning
- Prefer `async`/`await` over `.then()` chains
- Prefer destructuring: `const { id } = user` over `const id = user.id`
- Prefer array methods (`map`, `filter`, `reduce`) over `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) liberally
- Use template literals over string concatenation
- Use object shorthand: `{ foo }` over `{ foo: foo }`
- Use default parameters over manual checks
- Always use ES modules — never use `require()`

### TypeScript Anti-Patterns (prohibited)

All of these silence the compiler instead of proving correctness:

- Never use `any` — use `unknown` and narrow with type guards
- Never use `as` casts to silence errors (especially `as unknown as X`) — prove the type instead
- Never use `!` non-null assertions — handle the null/undefined case
- Never use `@ts-ignore` — if truly unavoidable, use `@ts-expect-error` with a reason comment (it fails when the error goes away)
- Never use `@ts-nocheck` — it disables type checking for the entire file; stronger than `@ts-ignore` and equally prohibited
- Never disable or loosen `strict` in tsconfig
- Never use loose built-in types (`Function`, `object`, `{}`) — write precise signatures and shapes
- Never cast unvalidated data at boundaries — no `JSON.parse(x) as User` without a runtime check

### Prohibited Tools & Practices

- Never use dotenv — manually load `.env` file
- Never use `require()` — ES modules only
- Never add a database driver package — the backend is SQLite through system `libsqlite3` FFI
- Never use axios, got, or similar — native `fetch` only
- Never use Tailwind (`tailwindcss`, `@tailwindcss/vite`), PostCSS, autoprefixer, or `tailwind.config.js` (lint: `no-banned-build-tooling`)
- oxlint is the only linter, and it runs only the local guardrails plugin (`guardrails/eslint-plugin`, loaded through `jsPlugins`, see **Guardrails** below) plus four core rules — never add ESLint, its parsers, third-party rule packs, shareable configs or other `jsPlugins`, and never the `globals` package (lint: `no-eslint-or-playwright`, `no-globals-package`)
- Runtime verify drives the `agent-browser` CLI — never add Playwright, Puppeteer or another browser driver, and never download Playwright's browsers (lint: `no-eslint-or-playwright`)
- Minimize external packages — use built-in/native solutions when possible

### Guardrails

Every written "never / don't" rule an agent keeps breaking becomes a machine check whose error message teaches the root cause and the fix. The rules in this file are the spec; `npm run lint` enforces the ones a single file's AST or filename can prove.

```bash
mise use -g npm:oxlint npm:agent-browser   # once per machine: the two global CLIs
npm run guardrails:install   # once: installs dependency-cruiser (+ TypeScript 5) into guardrails/ (nested, pinned)
npm run lint                 # oxlint: all guardrails over src/, scripts/, vite.*, guardrails/
npm run test:guardrails      # node --test: every rule's valid/invalid cases, each linted by the real oxlint
npm run depcruise            # dependency-cruiser over the whole import graph
npm run verify               # bash + agent-browser: every page and flow against the built app, logs to verify-artifacts/
```

- **Linter:** oxlint (a global CLI) is the only linter. `.oxlintrc.json` at the root loads the plugin through `jsPlugins`, turns oxlint's own categories off (`plugins: []`, `correctness: off`), enables the four core rules (`no-var`, `prefer-const`, `object-shorthand`, `prefer-template`), and splits the plugin's rules into two `overrides`: base rules on every linted file, app (React/UI) rules on `src/` only. It also fails on warnings and on unused disable directives. `guardrails/eslint-plugin/index.test.js` asserts the overrides list exactly the plugin's `BASE_RULES` and `APP_RULES`.
- **Where:** `guardrails/eslint-plugin/` — zero-dependency ES modules written against the ESLint rule API that oxlint's `jsPlugins` implement (the directory keeps that name; ESLint itself is not installed), one file per rule in `rules/` with a `<rule>.test.js` next to it. `lib/ruleTester.js` runs each test case through the real `oxlint` binary on a fixture file in a temp dir (with the case's `filename` and `options`) and checks every message by `messageId` and `data`.
- **Why nested:** the root keeps TypeScript 7 (no JS API); dependency-cruiser and the TypeScript 5 compiler API it reads `.ts` imports with live in `guardrails/package.json`. Do not add them to the root. oxlint and agent-browser are global CLIs; CI installs pinned versions with `npm install -g`.
- **Adding a rule:** when you write a new "never" rule here or in `skills/skateboard/rules/*.md`, add a lint rule for it if it is checkable from one file. Every message must say what was found, `Why:` the repo forbids it, and `Fix:` with the exact skateboard-ui export or pattern (the test harness asserts this). Register it in `guardrails/eslint-plugin/index.js`, enable it in the matching `.oxlintrc.json` override, and add it to the updater ALLOWLIST (`scripts/update-skateboard.js` `GUARDRAIL_RULES`). A rule that takes options must declare a `schema` (oxlint refuses options otherwise).
- **Disabling:** only with `// oxlint-disable-next-line skateboard/<rule> -- <reason>` (oxlint also honors `eslint-disable-*`); unused disables fail lint.
- **Layers:** `guardrails/eslint-plugin/layers.js` is the layer table (`ui` = src/components, `app` = rest of src/, `server` = backend/, `tooling` = scripts/, `build` = vite.*, `guardrails`) and the allowed import edges. `skateboard/layer-boundaries` enforces it per file, and `.dependency-cruiser.js` generates its layer rules from the same table (never hand-copy a layer into either).
- **Boundaries (`npm run depcruise`):** dependency-cruiser resolves every import on disk, so it proves what one file cannot: the layer table across the graph, no circular dependencies, no orphan modules, no devDependencies or Node builtins in `src/`, no packages missing from `package.json`, no unresolvable imports (including deep paths a package's `exports` map does not expose), no relative paths into `node_modules/`, no imports of test files. Each rule's `comment` states the root cause and the fix. Needs `npm ci` and `npm run guardrails:install` first.
- **Runtime verify (`npm run verify`):** bash, no Node. `guardrails/verify/app.sh` (synced) hands the app to the Garden runner (`verify/verify.sh`, found through the global `core.hooksPath` or `GARDEN_HOME`). The runner builds the frontend once (`vite build`), starts the real Rust backend serving `dist/` on a free port (throwaway SQLite under `verify-artifacts/`; nothing is mocked), and drives the `agent-browser` CLI. It opens the landing page, every `constants.json` page under `/app/`, settings, terms and the 404, then runs one flow per feature in `features.tsv` (the feature map: name, page, flow function, split by tabs; template-owned and not synced, like the flows) from that feature's page. The flows live in `guardrails/verify/flows.sh` (not synced, so an app keeps its own or has none): landing, guest entry, sign up, the main view, the empty state, command menu, settings, sign out, sign in and the terms page. A feature with no flow fails, so add the line and the flow together. Before the app starts, the runner checks the state chart `states.tsv` (template-owned, not synced): the app as a user sees it (`start`, `step` state, action, next state), plus rules (`never` a state, `only` reach a state by these actions). It fails a state no path reaches, a state with no way out, one action that leads to two states, or a broken rule, and prints the path. When a change adds a screen or a way between screens, add its steps. Last, the runner clicks and types at random for 30 steps and fails if any step crashes, logs a console error, gets a 5xx, blanks the page or shows `undefined`, `NaN` or `[object Object]`; it prints the steps and a seed (`GARDEN_VERIFY_SEED`) that replays them. `VERIFY_RANDOM_SKIP` in `app.sh` keeps it off the payment buttons, which need Stripe. Flows are bash functions chained with `&&` over the runner helpers `go`, `click`, `fill_in`, `press`, `see` (a regex over the accessibility snapshot), `not_see`, `gone`, `at_url`, `api`, `expect_eq`, `js_true` and `lit` (escapes a literal for a regex). It fails on any uncaught exception, console error or failed request (HTTP 4xx/5xx) not listed in `VERIFY_ALLOW`. agent-browser launches its own headless Chrome or Chromium in a private session; set `AGENT_BROWSER_EXECUTABLE_PATH` if it cannot find one. When you change a view a flow asserts, update the flow in the same change.
- **Pull requests:** the skateboard repo itself (and any repo in Garden's `GARDEN_PR_REPOS`) takes changes by pull request; PushGuard blocks pushes to master there. Apps not on that list still push to master. Work on a branch, then run `~/Projects/garden/review/pr.sh <body.md>`: it runs `npm run verify`, pushes the branch, and opens the pull request with your Why, What changed, Scope, Tradeoffs and Blast Radius sections plus the verify results, a GIF of the run and a link to the full report. A robot then posts an adversarial review. A person merges.
- **CI:** `.github/workflows/ci.yml` job `guardrails` runs lint, rule tests and depcruise; `.github/workflows/verify.yml` runs the flows on every pull request, uploads the screenshots, and keeps one PR comment linking them.

**Written rules that are NOT linted (and why):**

| Rule | Why not linted |
|---|---|
| Never disable/loosen `strict` in tsconfig; `@types` dev-only; `vite --force` in scripts; dependency pins in docs; version/`skateboardVersion` sync | Not JS/TS source (JSON, Markdown). `npm run typecheck` and `scripts/version-consistency.test.js` cover the version parts |
| No comments in code, doc comments included | Applies to new and edited lines; existing comments go when their code is edited. A whole-file rule would fail every app that still carries the JSDoc the removed `require-jsdoc-on-exports` rule demanded. Review |
| oxlint and agent-browser stay global CLIs, not `package.json` dependencies | `package.json` is JSON; review (`no-eslint-or-playwright` covers the tools they replaced) |
| Backend rules (zero crates, no `cargo add`, never hand-roll TLS, scrypt/JWT) | Rust — `cargo test`, review |
| Optional chaining / nullish coalescing, prefer destructuring, array methods over loops, default params | "Prefer" style calls; the useful versions need type information |
| Boolean names prefixed `is`/`has`/`should` | Needs type information to know a value is boolean |
| ~50 lines per function, ~150 lines per component, single responsibility, no magic numbers | Judgment calls with explicit "~" budgets |
| Max 3 levels of component nesting, prop drilling beyond 2 levels, colocate state | Cross-file component tree (dependency-cruiser sees imports, not JSX nesting or props) |
| Exactly one `<main>` per page, heading hierarchy, semantic HTML choice | Need the rendered page across shell + view files |
| Contrast ratios, touch targets ≥ 44px, focus-indicator contrast, color not the only signal | Need computed styles at runtime |
| Escape closes modals, focus trap/restore, arrow keys in composite widgets | Runtime behavior (provided by skateboard-ui primitives) |
| Every list has an empty state, every error is visible, partial success, loading > 200 ms | UI behavior across states; `use-list-data-states` and `no-empty-catch` cover the mechanical parts |
| External API rate limits, backoff, circuit breaker, no batch endpoint in a loop | Runtime policy per API |
| Never mock the module under test, one assertion per `it`, prefer real implementations | Test-design judgment |
| Margin between siblings, 3-5 colors per view, max 2 font families, no decorative shapes, AlertDialog for destructive actions | Design judgment (raw colors, `space-*`, arbitrary values, and `dark:` are linted) |
| Keep credentials out of logs | Data-flow analysis (hard-coded connection strings are linted) |

## Error Handling (MANDATORY)

**Error handling is a first-class feature, not an afterthought. Every error must be surfaced to the user in a clear, actionable way.**

### Core Rules

- Always handle errors at system boundaries (API calls, user input, DB queries)
- Never silently swallow errors — at minimum `console.error`
- Use try/catch for async operations that can fail
- Return meaningful error messages to the caller

### User-Facing Error Display

- **Every error must be visible to the user** — no silent failures
- Use toast notifications (`toast.error()`) for transient errors (network failures, API errors, validation)
- Use inline error states for form/input errors — show the error next to the field
- Use empty states with error messaging for failed data fetches — never show a blank screen
- **Error messages must be human-readable** — never show raw error codes, stack traces, or technical jargon. Translate API errors into plain language
- Include a recovery action when possible — "Try again", "Check your connection", "Contact support"

### Loading & Progress States

- Show loading indicators for any operation that takes >200ms
- For long operations (batch processing, API calls), show progress with a label
- If an operation can be cancelled, provide a cancel button
- Never leave the UI in a "loading" state after an error — always reset to an actionable state

### Graceful Degradation

- If a non-critical feature fails, the rest of the app must still work
- Partial success is better than total failure — if 15 of 20 items succeed, show the 15 and mark 5 as failed
- Cache previous successful results when possible so users don't lose work on retry

## External API Safety (MANDATORY)

**Every call to an external/third-party API must have rate limiting and backoff. No exceptions.**

- **Respect rate limits** — before writing code that calls an external API, check the API's rate limit docs and design within them
- **Exponential backoff on 429/5xx** — retry with increasing delays (1s → 2s → 4s → 8s), max 3-5 retries, then fail gracefully
- **Never loop API calls without throttling** — if calling an API N times, add delays between calls
- **Never call a batch endpoint in a loop** — if an API has a batch/bulk endpoint, call it ONCE, not once per item
- **Circuit breaker** — after 3 consecutive failures from an external API, stop calling it and surface the error to the user
- **Log rate limit headers** — if the API returns `X-RateLimit-Remaining` or similar, log it and stop before hitting zero

## React Rules

- Prefer functional components, never class components
- Colocate state with the component that owns it
- Avoid prop drilling beyond 2 levels — use context
- Event handlers prefixed with `handle` (`handleSubmit`, `handleDelete`)
- Never use `alert()`, `confirm()`, or `prompt()` — use shadcn Dialog/AlertDialog
- Max 3 levels of component nesting — flat is better than deep
- Every list/grid view needs an empty state (icon + message + CTA)
- Every data-fetching view handles 3 states: loading, error, data

## Styling & UI

- Plain CSS, no Tailwind: skateboard-ui's `styles.css` (its components and theme) plus this app's `src/assets/styles.css` (the classes `src/` uses, brand and dark-mode overrides). Both are edited by hand
- Style using utility-style classes on elements (`flex`, `gap-4`, `bg-background`). Every className token must be defined in one of those two files (lint: `no-unknown-classes`); for a new class, add its rule to `src/assets/styles.css` in the matching `@layer`, using the theme variables (`var(--spacing)`, `var(--muted)`)
- Theme values are plain CSS variables (`:root { --color-app: var(--color-purple-500); }`, `.dark { ... }`), never `@theme`, `@apply` or `@source`
- Support dark mode with bg-background, bg-accent — never manual `dark:` overrides (`dark:bg-gray-800`), semantic tokens handle it
- Use semantic color tokens (`bg-background`, `text-foreground`, `border-border`) — never raw colors (`bg-white`, `text-gray-500`)
- Status colors come from skateboard-ui 5.26+: `success`, `warning`, `info`, `danger`, each as `bg-*`, `bg-*/10`, `text-*`, `border-*`. Red text is `text-danger`: dark `--destructive` (39.6% lightness) is a fill color, too dark to read as text
- Use `gap-*` between flex/grid children — never `space-x-*` / `space-y-*`, never margin between siblings for spacing
- Limit palette to 3-5 semantic colors per view — don't rainbow
- Max 2 font families — 1 heading + 1 body (default: Geist Sans + Geist Mono)
- Use `rounded-md` / `rounded-lg` from design tokens — never arbitrary `rounded-[12px]`
- Prefer scale values (`p-4`, `gap-6`) — never arbitrary values (`p-[16px]`, `gap-[24px]`)
- Use `size-*` for square elements — never `w-10 h-10` when `size-10` works
- Use `text-balance` or `text-pretty` on headings and titles
- Use `cn()` for conditional class composition — never template literal ternaries
- Design mobile-first — use `min-width` breakpoints (`sm:`, `md:`, `lg:`), enhance upward
- Never use `transition-all` — be specific (`transition-colors`, `transition-opacity`, `transition-transform`)
- Never generate abstract decorative shapes (gradient circles, blurry blobs, decorative SVGs)

### Icons

- Default library: Lucide, vendored by skateboard-ui **5.13+** and exported from `@stevederico/skateboard-ui/icons`. Apps do **not** depend on `lucide-react` (the boilerplate dropped it in 5.17.0)
- **One icon funnel:** `src/icons.ts` is the only module that imports `@stevederico/skateboard-ui/icons`. It re-exports an explicit, named list (no `export *`) of every icon the app uses
- **Components import from the funnel:** `import { Plus, Trash2 } from '../icons'`. To use a new icon, add its Lucide name to `src/icons.ts` first
- Why: one list keeps the icon set auditable and tree-shakeable, and lets the app swap an icon for a local SVG in one place (rename to `icons.tsx` when it holds JSX). An icon skateboard-ui does not export fails the typecheck; add it as a local SVG component in the funnel
- **Never** import `@stevederico/skateboard-ui/icons` outside the funnel, never import `lucide-react` at all, and never deep paths (`@stevederico/skateboard-ui/icons/*`, `lucide-react/dist/...`, anything through `node_modules/`, `@stevederico/skateboard-ui/dist/...`) — lint enforces all three
- **Never** use public DynamicIcon — removed in 5.0 (was 4.17); shell-only `constantsIcon` resolves `constants.json` icon strings
- When migrating from 4.x: rewrite every `skateboard-ui/icons` and `DynamicIcon` import to a named import from the `src/icons.ts` funnel (see **Migrating 4.x → 5.0**)
- Never use emoji as UI icons — use proper icon components (exception: `constants.json` feature icons where the shell renders unknown/legacy values as text)
- Icon-only buttons must have `aria-label`
- Standard sizes: 16px inline, 18px buttons, 24px cards, 48px empty states

### Component Selection — use the right component:

| Need | Use | Not |
|------|-----|-----|
| Action | `<Button>` | `<button>` |
| Text input | `<Input>` + `<Label>` | `<input>` |
| Modal | `<Dialog>` | custom div |
| Confirmation | `<AlertDialog>` | `confirm()` |
| Toast | `toast()` from `sonner`, with one `<Toaster theme="system" />` mounted in the app layout (skateboard-ui mounts none since 3.0, so without it toasts never show) | `alert()` |
| Loading | `<Spinner>` / `<Skeleton>` | custom div |
| Empty state | `<Empty>` | conditional text |
| Side panel | `<Sheet>` | absolute div |

### Design Configuration

When a project uses `constants.json`, include a `design` block:
```json
"design": {
  "baseColor": "neutral",
  "radius": "medium",
  "font": "geist",
  "iconLibrary": "lucide"
}
```

## Accessibility (MANDATORY)

**Every UI element must be accessible. No exceptions, no shortcuts, no "we'll add it later."**

### Required on Every Element

- **All interactive elements** must have a visible text label OR an `aria-label` / `aria-labelledby` attribute
- **All images** must have meaningful `alt` text — use `alt=""` only for purely decorative images
- **All form inputs** must be associated with a `<Label>` via `htmlFor`/`id` pairing or by nesting
- **All icon-only buttons** must have `aria-label` describing the action (e.g., `aria-label="Close dialog"`, not `aria-label="X"`)
- **All custom interactive components** (divs/spans acting as buttons) must have `role`, `tabIndex`, and keyboard event handlers

### Semantic HTML

- Use semantic elements over generic divs: `<nav>`, `<main>`, `<section>`, `<article>`, `<header>`, `<footer>`, `<aside>`
- Every page must have exactly one `<main>` landmark
- Use heading hierarchy correctly (`h1` → `h2` → `h3`) — never skip levels for styling
- Use `<ul>`/`<ol>` for lists, `<table>` for tabular data — not divs styled to look like them

### ARIA Attributes

- `aria-label` for elements whose purpose isn't clear from visible text
- `aria-live="polite"` for dynamic content updates (toasts, status messages, loading states)
- `aria-expanded`, `aria-haspopup`, `aria-controls` on disclosure/dropdown triggers
- `aria-current="page"` on active navigation links
- `aria-describedby` to associate help text or error messages with form fields
- `role="status"` or `role="alert"` for status messages and errors
- Never use `aria-hidden="true"` on focusable elements

### Keyboard Navigation

- All interactive elements must be reachable via Tab key in logical order
- Escape must close modals, dropdowns, and popovers
- Arrow keys must navigate within composite widgets (tabs, menus, radio groups)
- Focus must be trapped inside open modals and restored to the trigger on close
- Visible focus indicators must never be removed (`outline-none` without a replacement is prohibited)

### Color, Contrast & Touch

- Text must meet WCAG 2.1 AA contrast ratios (4.5:1 normal text, 3:1 large text)
- Never convey information through color alone — pair with icons, text, or patterns
- Focus indicators must have minimum 3:1 contrast against adjacent colors
- Touch targets: minimum 44px on mobile — expand hit areas with padding if needed
- Honor `prefers-reduced-motion` — wrap animations in `motion-safe:` or use `@media (prefers-reduced-motion: reduce)`

## Security

- Never hard-code connection strings (MongoDB, Postgres, etc.)
- Use environment variables for secrets
- Keep credentials out of logs and output

## Testing Standards

**Every new feature must ship with tests. No tests, no merge.**

### Test Runner

- **Frontend / scripts:** Node's built-in test runner (`node --test`) — never Jest, Mocha, or Jasmine
- **Backend:** `cargo test` (`#[cfg(test)]` next to the code). Zero crate test frameworks.
- Root `npm run test` is frontend typecheck + script tests. No vitest. Backend: `cd backend && cargo test --locked`
- CI runs both.

### What to Test

- **Always test:** Business logic, data transformations, API route handlers, utility/helper functions, state management logic, auth flows, form validation, error handling paths, edge cases on public functions
- **Skip testing:** Trivial component rendering with no logic, third-party library wrappers, static configuration objects, pure CSS/layout

### Test File Conventions

- Test files live next to the code they test: `fetchUser.ts` → `fetchUser.test.ts`
- Component tests: `HomeView.tsx` → `HomeView.test.tsx`
- Name test files with `.test.ts` / `.test.tsx` suffix — never `.spec.ts`
- One test file per module

### Test Structure

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('fetchUser', () => {
  it('returns user object for valid id', async () => {
    const user = await fetchUser('123');
    assert.equal(user.id, '123');
  });

  it('throws on non-existent id', async () => {
    await assert.rejects(fetchUser('bad'), /Not found/);
  });
});
```

**Rules:**
- `describe` block per function/component
- `it` blocks describe behavior, not implementation
- One assertion per `it` block when possible
- Use `beforeEach`/`afterEach` for setup/teardown — never share mutable state across tests
- Prefer real implementations over mocks — mock only external boundaries (network, database, filesystem)
- Mock at the boundary, not the internals — mock `fetch`, not the function that calls `fetch`
- Reset mocks in `afterEach`
- Never mock the module under test

### When Modifying Existing Code

1. Run the existing test suite first — confirm baseline is green
2. If changing a function's behavior, update its tests to match
3. If fixing a bug, write a failing test that reproduces the bug *before* fixing it
4. If refactoring, tests should pass without modification

### Before Committing

1. `npm run test` passes with zero failures
2. New functions have corresponding test files
3. Modified functions have updated tests
4. No `.only` or `.skip` left in test files

## Git Standards

### Branching

- Default branch: `master`
- Branch naming: `feature/short-description`, `fix/short-description`, `chore/short-description`
- One PR per logical change

### Commits

- Commit messages in imperative mood ("Add feature" not "Added feature")
- One logical change per commit

### Commit Process

> **Which changelog?** In *this* skateboard boilerplate repo, releases are recorded in **`skateboard-changelog.md`** (NOT `CHANGELOG.md` — that filename is reserved so scaffolded apps don't inherit skateboard's history). Downstream apps created from skateboard use their own `CHANGELOG.md`. So: working on skateboard itself → `skateboard-changelog.md`; working on an app → `CHANGELOG.md`.

1. **Update the changelog** (`skateboard-changelog.md` in this repo; `CHANGELOG.md` in apps) — never remove anything. To-do list (dash-prefixed) stays at top. Insert new version notes below to-do section, above previous versions. List changes with 2-space indent, no dashes, 3 words or less, present tense.
2. **Update package.json** — bump version to match CHANGELOG (semver)
3. **Stage files** — only stage files you directly modified (no `git add .`)
4. **Commit** — message starts with version number, followed by descriptive summary
5. **Push and tag** — apps: `git push origin master && git tag 0.x.x && git push origin 0.x.x`. Repos in `GARDEN_PR_REPOS` (skateboard itself): PushGuard blocks pushing master, so push the branch with `review/pr.sh` (see Pull requests above); a person merges, then tags the merge commit on master.

## Architecture Overview

### Application Shell Architecture (v1.1)

Skateboard uses an **Application Shell Architecture** where skateboard-ui provides the framework (shell) and your app provides the content. This eliminates 95% of boilerplate.

**Three-part architecture:**
1. **Shell** (skateboard-ui package) - Routing, context, auth, utilities, components
2. **Content** (your code) - Custom components and business logic
3. **Config** (constants.json) - App-specific configuration

**Key principle:** Update skateboard-ui package once, all apps inherit improvements.

### Monorepo Structure
- **Root**: React 19 frontend on Vite 8 using skateboard-ui
- **Backend**: zero-crate Rust (`backend/`), SQLite via system libsqlite3

### Project Structure
```
skateboard/
├── src/
│   ├── components/       # Your custom components (e.g., HomeView.tsx)
│   ├── assets/
│   │   └── styles.css   # Brand color override (7 lines)
│   ├── main.tsx         # Route definitions + lazy view imports
│   ├── icons.ts         # Icon funnel: the only skateboard-ui/icons import
│   └── constants.json   # All your app config
├── backend/
│   ├── src/             # Zero-crate Rust server
│   ├── Cargo.toml       # Empty [dependencies]
│   ├── databases/       # SQLite database files
│   └── config.json      # Backend config with database settings
├── guardrails/
│   ├── eslint-plugin/   # Local lint rules for oxlint jsPlugins (one per written "never" rule)
│   ├── verify/          # app.sh + flows.sh (bash) for `npm run verify`
│   └── package.json     # Nested: dependency-cruiser + TypeScript 5 (not root deps)
├── .oxlintrc.json       # oxlint: loads the guardrails plugin, base/app overrides
├── .dependency-cruiser.js  # Import-graph boundaries, generated from the layer table
├── package.json         # Dependencies (includes skateboard-ui)
├── tsconfig.json        # Frontend TypeScript config (strict)
└── vite.config.ts       # Vite configuration (app-owned)
```

**What's NOT in your app (provided by skateboard-ui):**
- App context/state - Imported from `@stevederico/skateboard-ui/Context`
- Complex routing setup - Uses createSkateboardApp()
- Full theme CSS - Imports base theme from skateboard-ui

**Result:** ~550 lines of boilerplate → ~26 lines

### Frontend Stack
- React, Vite, skateboard-ui (routing via `useSafeNavigate`)
- TypeScript (`strict`, no-build-step typecheck), ES modules only
- Plain CSS (skateboard-ui `styles.css` + `src/assets/styles.css`), no Tailwind or PostCSS

### Backend Stack
- Runtime: zero-crate Rust (`std::net::TcpListener` + OS threads). Empty `[dependencies]`.
- SQLite via system `libsqlite3` FFI. Postgres and Mongo are not supported.
- Stripe HTTPS via system `libcurl` FFI. Never hand-roll TLS. Never add a crate.
- A crate needs an explicit yes. Do not `cargo add`.

### Invariants

The template's code carries no comments, so the rules a comment used to state live here. Break one and something fails at runtime, not at compile time.

**SQLite (`db.rs`)**
- Bind text with `SQLITE_TRANSIENT` (`ffi::transient()`), never `SQLITE_STATIC`: SQLite must copy the buffer, because the Rust `String` can drop before `sqlite3_step`.
- `Db` is `Send`, not `Sync`. The handle opens with `SQLITE_OPEN_FULLMUTEX`, which serializes calls inside libsqlite3, and startup refuses a library built with `SQLITE_THREADSAFE=0` (that build ignores the flag). Sharing `&Db` across threads would interleave `sqlite3_step` on one statement.
- `prepare` rejects SQL with a second statement after the first (a non-empty `tail`); silently dropping it would run half a typo.
- A write with `RETURNING` still yields rows: drain them so `changes` counts the whole statement.
- Read a column with `sqlite3_column_text` before `sqlite3_column_bytes`, and copy the bytes before the next call on the statement.

**libcurl (`stripe.rs`, `hrana.rs`)**
- `curl_easy_setopt` and `curl_easy_getinfo` are declared variadic and every argument goes at its documented width (`c_long` for long options and `CURLINFO_RESPONSE_CODE`, a pointer otherwise). A non-variadic declaration loses the value on Apple arm64 while `setopt` still returns `CURLE_OK`.
- `CURLOPT_NOSIGNAL` is always set: without it libcurl times out DNS with process-wide `SIGALRM`.
- Each module calls `curl_global_init` once (its own `Once`) before its first easy handle. An easy handle is used by one thread at a time (Hrana keeps it behind a `Mutex`); handles and header lists are freed exactly once (their wrappers are neither `Copy` nor `Clone`).
- Buffers passed to `CURLOPT_WRITEDATA` / `CURLOPT_HEADERDATA` and every pointer option outlive `curl_easy_perform`.

**Hrana (`hrana.rs`)**
- A baton is single use: send the one from the last response and drop it after an error. Reusing a spent baton fails every later statement on the pooled stream, `ROLLBACK` included.

**Stripe (`stripe.rs`, `routes.rs`)**
- Webhook signatures: compare in constant time against every `v1` entry and accept any match, because during secret rotation two valid signatures overlap.
- Checkout never sends `payment_method_types`; it would pin the method list and switch off the methods configured in the Stripe Dashboard.
- Stripe neither orders nor dedupes deliveries, so subscription events re-read the subscription from Stripe instead of trusting the event's snapshot (a late `created` would demote a paying user).

**HTTP and JSON (`http.rs`, `json.rs`)**
- Stray CRLFs before the request line are skipped (RFC 7230 §3.5); obsolete header line folding is rejected, not unfolded (§3.2.4).
- Shutdown unblocks `accept` (no timeout in std) with a throwaway connection to itself.
- Numbers print like JavaScript: `-0` as `0`, exponents as `1e+21`.

**bcrypt (`kdf.rs`)**
- `$2a$`, `$2b$` and `$2y$` hashes verify the same; the password gets a NUL terminator; only 23 of the 24 ciphertext bytes are encoded.

**Tests that set environment variables** hold `ENV_LOCK` for the whole test (`set_var` is only sound while no other thread reads the environment).

**Frontend**
- `public/theme-init.js` is a classic script served from `public/`: it runs while the HTML parses (no light flash before dark mode) and passes CSP `script-src 'self'` without `'unsafe-inline'`. A blocked `localStorage` (iOS web views) falls back to the system scheme.
- `index.html` keeps zoom enabled (WCAG 2.1 AA 1.4.4) and paints the theme background inline with no opacity gate, so a failed stylesheet shows unstyled content, not a blank page.
- `vite.config.ts` excludes skateboard-ui from prebundling, so `optimizeDeps.include` must list every CommonJS package it imports, `react/jsx-runtime` included.
- The updater never syncs `CLAUDE.md` as a file: git serves a symlink as its target string, so it would write the 9 bytes `AGENTS.md`. `SYMLINKS` recreates the link (tested in `scripts/update-skateboard.test.js`).

**Configuration** (`backend/config.json`):
```json
{
  "staticDir": "../dist",
  "database": {
    "db": "MyApp",
    "dbType": "sqlite",
    "connectionString": "./databases/MyApp.db"
  }
}
```

### Authentication & Security
- JWT tokens in HttpOnly cookies (HS256, byte-compatible with the old Node tokens)
- CSRF token protection for state-changing operations
- Scrypt password hashing (legacy bcrypt hashes verified and lazily rehashed on signin)
- JWT with 30-day expiration
- Security headers (CSP, HSTS, X-Frame-Options, etc.)

### Build System Integration

**Vite Configuration** (v1.1+ app-owned):
Apps own their `vite.config.ts` directly. See [reference implementation](https://github.com/stevederico/skateboard/blob/master/vite.config.ts).

- JSX comes from `tsconfig.json` (`"jsx": "react-jsx"`) via Vite's own transform — no `esbuild` block in `vite.config.ts`, no `@vitejs/plugin-react-swc`
- Do **not** pass `vite --force` or set `optimizeDeps.force: true` in normal dev (causes full dep re-bundle every start)
- Dev edits full-reload the page (no React Fast Refresh plugin)

**Styling:**
```css
/* src/assets/styles.css */
@import "@stevederico/skateboard-ui/styles.css";

/* plain CSS (no Tailwind): classes src/ uses that skateboard-ui does not define */

:root {
  --color-app: var(--color-purple-500);
}
```

## UI Components — shadcn Primitives

**Always use the shadcn primitives from `@stevederico/skateboard-ui/ui` when building views.** The goal is the standard shadcn design look and feel — clean, consistent, and composable.

**Import path:** `@stevederico/skateboard-ui/ui/<component>`

**Available components:**
`accordion`, `alert`, `alert-dialog`, `avatar`, `badge`, `button`, `calendar`, `card`, `checkbox`, `collapsible`, `command`, `dialog`, `drawer`, `dropdown-menu`, `empty`, `field`, `input`, `kbd`, `label`, `pagination`, `popover`, `progress`, `radio-group`, `scroll-area`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `slider`, `spinner`, `switch`, `table`, `tabs`, `textarea`, `toggle`, `toggle-group`, `tooltip`

**Rules:**
- Prefer shadcn components over custom HTML elements (e.g., use `<Button>` not `<button>`, `<Card>` not `<div className="card">`)
- Compose views from these primitives — don't reinvent patterns they already solve
- Check available components before building custom UI; if shadcn has it, use it
- Combine with utility-style classes for layout and spacing (defined in skateboard-ui's or the app's CSS)
- Before using a component for the first time, read its source — many use compound patterns, not prop APIs

**Compound Components — these use sub-components, NOT props:**
```javascript
// Empty state — compound pattern (NOT <Empty icon={} title={}>)
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@stevederico/skateboard-ui/ui/empty';

<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon"><Folder size={24} /></EmptyMedia>
    <EmptyTitle>No items yet</EmptyTitle>
    <EmptyDescription>Create your first item to get started.</EmptyDescription>
  </EmptyHeader>
  <Button>Create Item</Button>
</Empty>

// Card — compound pattern
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@stevederico/skateboard-ui/ui/card';

// Dialog — compound pattern
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@stevederico/skateboard-ui/ui/dialog';
```

**Header — use `children` for right-side actions:**
```javascript
import Header from '@stevederico/skateboard-ui/Header';

// Props: title, buttonTitle, onButtonTitleClick, children
// Use children for custom right-side content (buttons, dialogs, etc.)
<Header title="Projects">
  <Button size="sm"><Plus size={18} /> New Project</Button>
</Header>

// Simple text button shorthand:
<Header title="Settings" buttonTitle="Save" onButtonTitleClick={handleSave} />
```

**Standard imports:**
```javascript
import { Button } from '@stevederico/skateboard-ui/ui/button';
import { Input } from '@stevederico/skateboard-ui/ui/input';
import { Label } from '@stevederico/skateboard-ui/ui/label';
```

## Key Implementation Patterns

### API Requests

```javascript
import { apiRequest } from '@stevederico/skateboard-ui/Utilities';

// GET request
const deals = await apiRequest('/deals');

// POST with body
const newDeal = await apiRequest('/deals', {
  method: 'POST',
  body: JSON.stringify({ name: 'New Deal', amount: 5000 })
});
```

**Features:**
- Auto-includes credentials
- Auto-adds CSRF token for mutations
- Auto-redirects to /signout on 401
- 30-second timeout

### Data Fetching with Hooks

```javascript
import { useListData } from '@stevederico/skateboard-ui/Utilities';
import { Spinner } from '@stevederico/skateboard-ui/ui/spinner';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@stevederico/skateboard-ui/ui/empty';
import { Button } from '@stevederico/skateboard-ui/ui/button';
import { CircleAlert } from '../icons'; // add CircleAlert to src/icons.ts first

function DealsView() {
  const { data, loading, error, refetch } = useListData('/deals');

  // Loading state
  if (loading) return <div className="flex flex-1 items-center justify-center"><Spinner /></div>;

  // Error state
  if (error) return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon"><CircleAlert size={24} /></EmptyMedia>
        <EmptyTitle>Failed to load deals</EmptyTitle>
        <EmptyDescription>{error}</EmptyDescription>
      </EmptyHeader>
      <Button onClick={refetch}>Try again</Button>
    </Empty>
  );

  // Data state
  return data.map(deal => <DealCard key={deal.id} {...deal} />);
}
```

### Context Usage

```javascript
import { getState } from '@stevederico/skateboard-ui/Context';

function MyComponent() {
  const { state, dispatch } = getState();
  const user = state.user;

  // Update user
  dispatch({ type: 'SET_USER', payload: newUserData });

  // Clear user (sign out)
  dispatch({ type: 'CLEAR_USER' });
}
```

### Environment Setup
Backend requires `.env` file with:
- `JWT_SECRET` - Token signing key (required)
- `STRIPE_KEY` - Payment processing (required)
- `STRIPE_ENDPOINT_SECRET` - Webhook verification (required)
- `CORS_ORIGINS` - Comma-separated allowed origins (production)
- `FRONTEND_URL` - Frontend URL for Stripe redirects (production)
- `FREE_USAGE_LIMIT` - Usage limit for free users (default: 20)
- `NODE_ENV` - `production` enables HSTS, skips `.env` loading, and requires a 32+ character `JWT_SECRET`
- `PORT` - Listen port (default: 8000; `SKATEBOARD_BACKEND_PORT` wins in dev, see **Ports**)

Database connection is SQLite only and lives in `backend/config.json` — there are no
`DATABASE_URL`, `MONGODB_URL`, or `POSTGRES_URL` variables.

## Reference Documentation

When working with these libraries, consult the provided documentation before making assumptions.

| Library | Documentation URL |
|---|---|
| shadcn/ui | https://ui.shadcn.com/llms.txt |
| Vite | https://vite.dev/llms.txt |
| Rust std | https://doc.rust-lang.org/std/ |

## Agent skill (required reading)

This repo ships **`skills/skateboard/SKILL.md`** — the Cursor/Claude skill for building and upgrading skateboard apps.

**When to use it:** scaffolding, editing views/`constants.json`, choosing shadcn primitives, Rust backend auth/Stripe/SQLite, running `scripts/update-skateboard.js`, fixing template drift, or any task that mentions skateboard / skateboard-ui.

**What agents must do:**
1. Read `skills/skateboard/SKILL.md` first (and `skills/skateboard/rules/*` for icons/forms/styling/views as needed).
2. Prefer shadcn primitives from `@stevederico/skateboard-ui/ui/*` over raw HTML.
3. Import icons by name from the `src/icons.ts` funnel; only that file imports `@stevederico/skateboard-ui/icons` (see Icons below).
4. Treat `skateboardVersion` as a label — verify the tree (especially `backend/`) matches the template before claiming an upgrade is done.
5. For upgrades, follow **Migrating 4.x → 5.0** below (and `docs/UPGRADE.md`).
6. Run `npm run lint` and `npm run depcruise` (after `npm run guardrails:install`) and fix what they report; each message names the fix. Run `npm run verify` after any UI or auth change (see **Guardrails**).

Canonical pins live in this repo’s `package.json` (`version` / `skateboardVersion` / `@stevederico/skateboard-ui`). Refresh the skill metadata when those move.

## Documentation

**Reference:** [docs/GUIDE.md](docs/GUIDE.md) - Architecture, API, Schema, Deployment, Migration (consolidated)

**Version:**
- skateboard@5.36.0
- skateboard-ui@5.27.0

## Migrating 4.x → 5.0 (exact checklist)

**5.0 is a breaking major** for both the boilerplate (`skateboard`) and the shell (`@stevederico/skateboard-ui`). Apps on any **4.x** pin must complete every step below. Do not stamp `skateboardVersion: "5.0.0"` until the checklist is green.

### A. Preconditions

1. Confirm the app is skateboard: `package.json` has `skateboardVersion`.
2. Clean git tree (commit or stash). Branch: `chore/skateboard-5`.
3. Note current versions: `skateboardVersion` and `@stevederico/skateboard-ui` in `package.json`.

### B. Boilerplate / Rust backend (if still on Node/Hono or behind on Rust)

4. Refresh the updater from master:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/stevederico/skateboard/master/scripts/update-skateboard.js -o scripts/update-skateboard.js
   ```
5. Run: `node scripts/update-skateboard.js --yes`
   - If it says “Already on latest” but `backend/server.ts` or `backend/package.json` still exists, re-run with `--baseline <real-prior-version>` from git history.
6. Resolve every `<<<<<<<` conflict. Port custom Hono routes into `backend/src/routes.rs`. Schema lives in `backend/src/db.rs`.
7. Confirm zero-crate Rust: `backend/Cargo.toml` has empty `[dependencies]`. Backend commands are `cargo run` / `cargo test --locked` — not `npm run server`.

### C. Install skateboard-ui 5.0.0

8. Install exact pin (must match this template):
   ```bash
   npm install @stevederico/skateboard-ui@5.0.0 --save-exact
   ```
9. `npm run verify:ui` (or compare `package.json` vs `node_modules/@stevederico/skateboard-ui/package.json`). Declared must equal installed. Commit `package.json` **and** `package-lock.json` together.

### D. Breaking frontend API changes (ui 5.0)

10. **Icons — rewrite all imports**
    ```bash
    # Find call sites
    rg -n "skateboard-ui/icons|DynamicIcon" src
    ```
    - Replace `import { X } from '@stevederico/skateboard-ui/icons'` (and `/icons/X`) with `import { X } from '../icons'`, and add `X` to the explicit `export { ... } from 'lucide-react'` list in `src/icons.ts` (the only file that imports `lucide-react`; see **Icons**).
    - Delete every `import DynamicIcon from '@stevederico/skateboard-ui/DynamicIcon'` — use a named Lucide icon from the `src/icons.ts` funnel in app code. Shell still resolves `constants.json` `icon` strings privately (`constantsIcon`); apps do not get a public dynamic resolver.
    - Ensure `lucide-react` is listed in app `dependencies` (boilerplate ships it; ui 5.0 also depends on it).
    - **Then continue to ui 5.13+ (boilerplate 5.17.0):** the funnel re-exports from `@stevederico/skateboard-ui/icons` instead of `lucide-react`, `lucide-react` leaves `dependencies`, and `react-router` joins them (a peer of ui since 5.12.0). See `docs/UPGRADE.md` → 5.17.0. **Then ui 5.16+ (boilerplate 5.18.0):** react-router is vendored inside skateboard-ui, so `react-router` leaves `dependencies` again and router imports come from `@stevederico/skateboard-ui/router`. See `docs/UPGRADE.md` → 5.18.0.

11. **UI import paths**
    - Use `@stevederico/skateboard-ui/ui/<name>`, `@stevederico/skateboard-ui/lib/utils` (`cn`) and `@stevederico/skateboard-ui/hooks/use-mobile`.
    - The old `@stevederico/skateboard-ui/shadcn/...` paths were removed in skateboard-ui 5.17.0 (lint: `no-removed-skateboard-ui-imports`). Rewrite `/shadcn/ui/X` → `/ui/X`, `/shadcn/lib/utils` → `/lib/utils`, `/shadcn/hooks/X` → `/hooks/X`; `grep -rn "skateboard-ui/shadcn" src` must print nothing.

12. **Routing**
    - Apps must **not** import `react-router` / `react-router-dom` (lint: `no-direct-react-router`). Navigate with `useSafeNavigate()` from `@stevederico/skateboard-ui/Utilities`.
    - skateboard-ui 5.16+ vendors react-router (7.18.5, past the CVE-2026-55685 fix in 7.18.3) and exports it: any other router API (`useParams`, `useSearchParams`, `Link`, `Navigate`, ...) comes from `@stevederico/skateboard-ui/router` (`react-router/dom` → `@stevederico/skateboard-ui/router/dom`). Same API, only the import path changes.
    - Keep exactly one router copy: no `react-router` in `package.json`, none in `vite.config.ts` `resolve.dedupe` / `optimizeDeps.include`. Check with `grep -rnE "from ['\"]react-router(-dom)?(/[^'\"]*)?['\"]" src` (must print nothing). A second copy breaks router context: hooks throw "may be used only in the context of a <Router>" and `useSafeNavigate` falls back to full page loads.
    - The router version moves only with the skateboard-ui pin. Its security advisories are not seen by `npm audit` (no dependency); skateboard-ui re-vendors when one applies.

13. **Removed Utilities (already gone in late 4.x — confirm)**
    - No `useForm`, `logEvent`, or public `setSidebarVisible` / `setTabBarVisible` (use `showSidebar` / `hideSidebar` / `showTabBar` / `hideTabBar` if needed).

### E. Vite / frontend toolchain (boilerplate 5.0)

14. **Drop `@vitejs/plugin-react-swc`**
    - Remove from `package.json` `devDependencies` and from `vite.config.ts` plugins.
    - JSX comes from `tsconfig.json` (`"jsx": "react-jsx"`); `vite.config.ts` needs no `esbuild` block.
    - Expect **full page reload** on edit (no React Fast Refresh plugin).

15. **Drop forced dep re-optimize**
    - Scripts: `vite --mode development` — **not** `vite --force`.
    - Remove `optimizeDeps.force: true` from `vite.config.ts`.

16. **Drop leftover coverage scripts** if present: `test:coverage`, `test:coverage:build`.

17. Align `vite.config.ts` / `vite.plugins.ts` with the template via the updater (or copy from the reference repo).

### F. Verify

18. `npm run typecheck`
19. `npm run test` (frontend script tests)
20. `cd backend && cargo test --locked`
21. Smoke: `npm run start` + `cd backend && cargo run` — sign-in, one API round-trip, checkout/portal only if Stripe env is set.
22. Optional live Stripe webhook: `backend/scripts/stripe-cli-replay.sh` (never CI).

### G. Stamp versions

23. Set `version` and `skateboardVersion` in `package.json` to **5.0.0** (must be equal).
24. Update the app’s `CHANGELOG.md` / docs that name old versions.
25. Commit on the branch. Do not push/merge without approval.

### What 5.0 does *not* require

- No rewrite of `constants.json` shape (icon **values** stay Lucide name strings).
- No change to `@stevederico/skateboard-ui/ui/*` import strings for apps.
- Calendar / CommandMenu / TextView / mid-tier primitives (accordion, progress, …) remain available.

## Updating from Skateboard Boilerplate

This project was created from the skateboard boilerplate. The `skateboardVersion` field in package.json indicates which version was used.

**Reference repo:** https://github.com/stevederico/skateboard

For **4.x → 5.0**, use the checklist above (not only the short workflow).

### Update Workflow (general)

1. Check `skateboardVersion` in package.json against latest release
2. Review `skateboard-changelog.md` in the reference repo for changes
3. Update skateboard-ui to the pin in the reference `package.json`: `npm install @stevederico/skateboard-ui@<pin> --save-exact`
4. Run `scripts/update-skateboard.js` for vendored boilerplate (especially `backend/`)
5. Apply the breaking-change steps for that release (for 5.0: section **Migrating 4.x → 5.0**)
6. Update `skateboardVersion` only after verify is green

**CRITICAL — never bump a version in `package.json` without installing it.** Editing the
dependency string (or running `npm install <pkg>@x` then reverting node_modules) leaves the
*declared* version ahead of the *installed* one — the lockfile and `node_modules` still hold
the old code, so builds/tests pass against stale deps and the bump is a lie. After ANY change to
a version in `package.json`:
1. Run `npm install` so the lockfile + `node_modules` actually match.
2. Verify declared == installed before committing:
   `npm run verify:ui` (for skateboard-ui), or
   `npm ls <pkg>` / compare `package.json` vs `node_modules/<pkg>/package.json`.
3. Commit `package.json` **and** `package-lock.json` together — never one without the other.

### Safe to Update (review and apply)
- `backend/src/*` - Rust server
- `vite.config.ts` - Build configuration
- `src/assets/styles.css` - Theme variables (merge carefully)
- `.oxlintrc.json`, `.dependency-cruiser.js`, `guardrails/` - Lint, boundary and runtime-verify guardrails (template-owned; `guardrails/verify/app.sh` checks every page of any app; `guardrails/verify/flows.sh` asserts the template's own views and is not synced, so an app keeps its own or has none)

### Never Auto-Update (app-specific)
- `constants.json` - App configuration
- `src/components/*` - Custom components
- `src/icons.ts` - The app's icon list
- `backend/config.json` - Database/environment config

### Important
Do NOT automatically apply boilerplate updates. Always consult the user first and show what changes would be made.

Always read the README in the @stevederico/skateboard-ui package before working with components.
