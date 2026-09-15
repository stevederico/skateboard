---
name: skateboard
author: stevederico
description: >
  Build, modify, and upgrade apps with Skateboard boilerplate + @stevederico/skateboard-ui.
  Use when scaffolding, editing a skateboard app, choosing components, constants.json,
  Rust backend auth/Stripe/SQLite, upgrading boilerplate / skateboardVersion,
  running update-skateboard.js, fixing template drift, migrating 4.x → 5.0,
  or the user says skateboard / skateboard-ui.
metadata:
  version: "5.6.0"
  skateboard-ui: "5.1.0"
  sources:
    - https://github.com/stevederico/skateboard
    - https://github.com/stevederico/skateboard-ui
---

# Skateboard Skill

**Canonical versions (refresh this skill when these move):**

| Package | Version | Role |
|---|---|---|
| **skateboard** (boilerplate) | **5.6.0** | App scaffold (copied into new repos) |
| **@stevederico/skateboard-ui** | **5.1.0** | Shell + components (npm package — pin exact) |

Docs: https://stevederico.github.io/skateboard/ · Boilerplate: https://github.com/stevederico/skateboard · UI: https://github.com/stevederico/skateboard-ui

> **Template drift:** scaffolded apps are *copies*. `skateboardVersion` in `package.json` is a **label**, not proof the tree matches upstream. Prefer bumping **skateboard-ui** as a dependency; use **`scripts/update-skateboard.js`** for vendored boilerplate (especially backend).

> **4.x → 5.0 (breaking):** follow **AGENTS.md → Migrating 4.x → 5.0** in the reference repo (full checklist). Also `docs/UPGRADE.md`.

## The Four Commandments

1. **Use skateboard-ui shadcn primitives** — never raw HTML when a component exists
2. **Use semantic design tokens** — never raw colors, hardcoded radii, or magic numbers
3. **Compose from patterns** — Cards, Dialogs, Forms have defined structures; follow them
4. **Validate accessibility** — every interactive element needs a label, keyboard support, and contrast

## Architecture

**Application Shell** in three parts:

1. **Shell** (`@stevederico/skateboard-ui`) — routing, context, auth UI, shadcn-style UI primitives
2. **Content** (your code) — views + business logic under `src/components/`
3. **Config** (`src/constants.json`) — app-specific configuration

Update skateboard-ui once → all apps inherit (when they install the new version).

## Scaffolding

```bash
npx create-skateboard-app@latest my-app --yes
cd my-app
# install: bun install works; package scripts still use npm (keep scripts npm-compatible)
bun install   # or: npm run install-all
bun run start   # or: npm run start   (Vite :5173)
cd backend && cargo run               # Rust :8000
```

- Frontend: http://localhost:5173  
- Backend: http://localhost:8000  
- Stack: **React 19** · **react-router v7.18+** (via ui) · **Vite 8** (esbuild JSX, no SWC plugin) · **Tailwind v4** · **lucide-react** · **zero-crate Rust** · **SQLite**

## Project Structure (current boilerplate)

```
my-app/
├── src/
│   ├── components/          # App views (HomeView, skeletons, …)
│   ├── assets/styles.css    # Brand tokens + optional utilities
│   ├── main.tsx             # Routes + createSkateboardApp
│   └── constants.json       # App config
├── backend/
│   ├── src/                 # zero-crate Rust server
│   ├── Cargo.toml           # empty [dependencies]
│   ├── config.json
│   └── databases/           # local SQLite files (not for Docker secrets)
├── package.json             # skateboardVersion + pin skateboard-ui exact
└── vite.config.ts
```

## Entry — `src/main.tsx`

```tsx
import './assets/styles.css';
import { lazy, Suspense } from 'react';
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import type { AppRoute } from '@stevederico/skateboard-ui/App';
import Layout from '@stevederico/skateboard-ui/Layout';
import constants from './constants.json';
import HomeViewSkeleton from './components/HomeViewSkeleton';

const HomeView = lazy(() => import('./components/HomeView'));

export function AppLayout() {
  return (
    <>
      {/* global overlays e.g. CommandMenu */}
      <Layout />
    </>
  );
}

export const appRoutes: AppRoute[] = [
  {
    path: 'home',
    element: (
      <Suspense fallback={<HomeViewSkeleton />}>
        <HomeView />
      </Suspense>
    ),
  },
];

createSkateboardApp({
  constants,
  appRoutes,
  defaultRoute: 'home',
  overrides: { layout: AppLayout },
});
```

**Rules:**
- Routes are **relative** (no leading slash)
- `defaultRoute` = initial authenticated route
- `overrides.layout` wraps shell Layout (CommandMenu, etc.)
- Lazy-load heavy views + **content skeleton** fallbacks (ui 4.13+)

## `constants.json`

| Key | Purpose |
|-----|---------|
| `appName` / `appIcon` / `tagline` | Branding |
| `noLogin` | `true` skips auth |
| `authOverlay` | modal auth vs redirect |
| `sidebarCollapsed` | default sidebar |
| `pages` | sidebar nav (`title`, `url`, `icon`) |
| `backendURL` / `devBackendURL` | API bases |
| `features` / `stripeProducts` / `pricing` | landing + billing UI |
| `design` | `baseColor`, `radius`, `font`, `iconLibrary` |

```json
"design": {
  "baseColor": "neutral",
  "radius": "medium",
  "font": "geist",
  "iconLibrary": "lucide"
}
```

## Styling — `styles.css` (minimal)

```css
@import "@stevederico/skateboard-ui/styles.css";
@source '../../node_modules/@stevederico/skateboard-ui';

@theme {
  --color-app: var(--color-purple-500);
}
```

Change `--color-app` for brand primary. Prefer tokens over raw colors.

## Frontend APIs (skateboard-ui)

```tsx
import { apiRequest, useListData } from '@stevederico/skateboard-ui/Utilities';
import { getState } from '@stevederico/skateboard-ui/Context';

const data = await apiRequest('/endpoint');
const created = await apiRequest('/endpoint', {
  method: 'POST',
  body: JSON.stringify({ name: 'New Item' }),
});

const { data, loading, error, refetch } = useListData('/endpoint');
const { state, dispatch } = getState();
```

`apiRequest`: credentials, CSRF, timeout, 401 handling.

**Import shadcn:** `@stevederico/skateboard-ui/shadcn/ui/<component>`  
**Shell pieces:** `…/Header`, `…/Layout`, `…/App`, etc. (see package `exports`)

## Backend — zero-crate Rust

### Runtime

- Empty `[dependencies]`. System `libsqlite3` + `libcurl`. Do not `cargo add`.
- `cd backend && cargo run` / `cargo test --locked`. Do not wrap cargo in npm.

### Auth (current)

- **JWT HS256** (byte-compatible with the old Node tokens)
- **Passwords: scrypt**; legacy **bcrypt** hashes still verify then rehash
- HttpOnly cookies, CSRF, security headers

### Env

```
JWT_SECRET=                 # required for auth
STRIPE_KEY=
STRIPE_ENDPOINT_SECRET=
CORS_ORIGINS=               # prod
FRONTEND_URL=               # Stripe redirects
```

- **`backend/.env` must be a regular file** — never a symlink (4.12 refuse + Docker guards)
- No `dotenv` crate — `backend/src/config.rs` parses `.env` by hand

### Database

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

`dbType` must be `sqlite`. Postgres and Mongo are not supported.

## Component selection (use / not)

| Need | Use | Not |
|------|-----|-----|
| Action | `<Button>` | raw `<button>` / `<a onClick>` |
| Text | `<Input>` + `<Label>` | bare `<input>` |
| Long text | `<Textarea>` + `<Label>` | bare `<textarea>` |
| Select | `<Select>` | native `<select>` |
| Boolean | `<Switch>` + `<Label>` | bare checkbox |
| Container | `<Card>` | `div.card` |
| Modal | `<Dialog>` | custom modal div |
| Side panel | `<Sheet>` | absolute div |
| Mobile sheet | `<Drawer>` | fixed bottom hack |
| Tabs | `<Tabs>` | hand-rolled tabs |
| Table | `<Table>` | raw table soup |
| Loading | `<Spinner>` / `<Skeleton>` | ad-hoc spinner |
| Empty | `<Empty>` | “nothing here” text only |
| Toast | `toast()` (sonner) | `alert()` |
| Confirm | `<AlertDialog>` | `window.confirm` |
| Field group | `<Field>` | freeform label/input/error |

Import primitives as `@stevederico/skateboard-ui/shadcn/ui/<name>` (public path; ui **5.0** remaps exports to `ui/`). Shell uses a subset; fleet apps use more (button, empty, card, dialog, command, …).

## Header

```tsx
import Header from '@stevederico/skateboard-ui/Header';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';

<Header title="Projects">
  <Button size="sm">New</Button>
</Header>
```

## Rules (detail)

- **[Styling](rules/styling.md)** — tokens, spacing
- **[Composition](rules/composition.md)** — Card/Dialog/Form patterns
- **[Forms](rules/forms.md)** — labels, validation
- **[Icons](rules/icons.md)** — Lucide
- **[Guidelines](rules/guidelines.md)** — interface guidelines
- **[Views](rules/views.md)** — page layout, data fetching

## Upgrading an existing app (boilerplate + UI)

Boilerplate (**vendored** backend + glue) and **skateboard-ui** (npm) are **two channels**. Bumping the UI package does **not** update `backend/src/*.rs`.

### Why apps drift

| Layer | How it updates | Drift? |
|---|---|---|
| **Frontend shell** | `@stevederico/skateboard-ui` npm pin | Low — version bump pulls fixes |
| **App glue** | `src/main.tsx`, `styles.css`, optional `CommandMenu` / landing sheets | Mild — may lag new patterns |
| **Backend** | Copied at scaffold (`backend/src/*.rs`) | **High** — no auto channel unless you run the updater |

`skateboardVersion` can be bumped while backend still ships Hono. **Trust the tree, not the label.** Canonical is empty `[dependencies]` in `backend/Cargo.toml`.

### Audit (is this app behind?)

```bash
# Still on the Node backend? → drifted regardless of skateboardVersion
test -f backend/package.json && echo drifted
grep -E '^\[dependencies\]' -A2 backend/Cargo.toml   # must stay empty
```

### Recipe A — full upgrade (preferred)

Requires the app to have (or receive) `scripts/update-skateboard.js` from [skateboard](https://github.com/stevederico/skateboard) **≥ 4.6.0** (4.7.0+ better). The updater **3-way merges** using the app's `skateboardVersion` as baseline → preserves local edits; conflicts show as `<<<<<<<`.

```bash
# 1) Refresh the updater itself first (old copies had allowlist gaps ≤4.5.0)
#    Copy latest scripts/update-skateboard.js from canonical skateboard into the app.

# 2) From the app root:
node scripts/update-skateboard.js --yes
# optional: node scripts/update-skateboard.js --baseline 3.7.0
#   (when the version label was stamped without files actually migrating)

# 3) Resolve conflicts — custom Hono routes must be ported into backend/src/routes.rs.
#    Schema lives in backend/src/db.rs (ensure_schema). DIFF before taking canonical.

# 4) Bump UI to 5.0.0 (exact)
npm install @stevederico/skateboard-ui@5.0.0 --save-exact
# If your registry enforces a min-release-age and the package is <7 days old,
# use a *scoped* bypass only for this package, e.g.:
#   bun add @stevederico/skateboard-ui@5.0.0 --exact --minimum-release-age 0
# Never bare --min-release-age=0 / --minimum-release-age 0 on a full tree install.
# Then complete AGENTS.md "Migrating 4.x → 5.0" (icons, Vite/SWC, verify).

# 5) Lockfile: commit package-lock.json (source of truth). If you use Bun for install:
#    bun install
#    npm install --package-lock-only --ignore-scripts
#    do not commit bun.lock if the project gitignores it

# 6) Validate
npm run typecheck
npm test
cd backend && cargo test --locked
npm run verify:ui   # if present

# 7) Only then treat skateboardVersion as honest (updater stamps it when clean)
```

**Updater behavior (know this):**

- Deps: **adds** what canonical added, **prunes** what canonical dropped, bumps only non-customized versions
- Files: 3-way merge — custom routes/tables survive when possible
- Renames handled (e.g. `.js`→`.ts`, `CLAUDE.md`→`AGENTS.md` + symlink)
- If any file conflicts/errors: **`skateboardVersion` is NOT stamped** — fix and re-run
- Do **not** auto-run on every agent session without user intent

**Conflict hygiene:**

```bash
# Search ALL file types, not only .ts
git grep -lnE '^(<<<<<<<|=======|>>>>>>>)' || true
```

- **`AGENTS.md` / project instructions:** prefer **app** side (app-owned)
- **Unused adapters:** often take canonical
- **Configured adapter + custom `CREATE TABLE` / domain functions:** keep app logic; merge carefully — blind `cp` has wiped app data layers before

### Recipe B — still on Hono

Run the updater. Do not keep a parallel Node backend. Port custom routes into `backend/src/routes.rs`.

### Frontend-only UI bump

```bash
npm install @stevederico/skateboard-ui@<ver> --save-exact
# reinstall + commit lockfiles; run verify:ui if available
```

Optional backfills (vendored into **app** `src/components/`, not the npm package): `CommandMenu`, landing sheets — copy from canonical if missing. **Guest/WebRTC apps** that skip the shell should not force shell components.

### Common gotchas

| Issue | Fix |
|---|---|
| Feature icons empty | `constants.features.items[].icon` must be **Lucide names** (`lock`, `credit-card`), not emoji |
| `skateboard-ui/icons` or `DynamicIcon` import fails | **5.0** — named-import from `lucide-react` instead |
| Landing header CTA short | Button `size="default"` next to icon ThemeToggle (not `sm`) |
| Updater `.js` conflict missed | `git grep` conflict markers in **all** extensions |
| Empty `STRIPE_ENDPOINT_SECRET=` in `.env.example` | Can poison tests that load example into `process.env` |
| `serveStatic` 404s assets | Pass **relative** `config.staticDir` (`../dist`), not absolute path |
| Testless frontend | Canonical has no `src/**/*.test.jsx`; do not add vitest |
| Deno-era `node_modules/.deno` | Remove; use npm/bun + `package-lock.json` |

### After upgrade checklist

- [ ] No `backend/package.json` / no Hono; `backend/Cargo.toml` `[dependencies]` empty
- [ ] No conflict markers anywhere
- [ ] `skateboard-ui` exact pin matches intended version; `verify:ui` OK
- [ ] `typecheck` + tests green
- [ ] Manual sign-in works (if auth enabled)
- [ ] `skateboardVersion` only trusted if updater stamped clean or you verified by diff

## Agent checklist

1. Pin `@stevederico/skateboard-ui` **exact**; run `verify:ui` when present
2. Prefer **ui components + tokens** over one-off CSS
3. Backend: **zero-crate Rust**, scrypt + HS256 JWT, no mongoose/axios/dotenv, no crates
4. Never commit secrets; never ship `.env` via symlink/Docker context
5. Teach **TS** frontend paths (`main.tsx`) and **Rust** backend (`backend/src/`)
6. **Upgrades:** two channels — UI npm + `update-skateboard.js` for vendored backend; never bump the version label alone
