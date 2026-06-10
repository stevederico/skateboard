---
layout: default
title: Configuration
description: Complete reference for Skateboard configuration — src/constants.json, backend/config.json, and environment variables.
---

# Configuration

Complete reference for every Skateboard configuration surface: the frontend `src/constants.json`, the backend `backend/config.json`, and the environment variables loaded from `backend/.env`.

Three files (plus your env) control the entire app:

| File | Owns | Auto-updated by boilerplate script? |
|---|---|---|
| `src/constants.json` | App identity, navigation, features, pricing, legal copy | No (app-owned) |
| `backend/config.json` | Static dir, database type and connection | No (app-owned) |
| `backend/.env` | Secrets and runtime overrides | No (app-owned) |
| `src/assets/styles.css` | Brand color + design tokens | Reviewed/merged |
| `tsconfig.json` / `backend/tsconfig.json` | TypeScript typecheck config (frontend / backend; both `noEmit` — Vite/esbuild transpiles) | Reviewed/merged |

---

## App Configuration (`src/constants.json`)

This is the single source of truth for the frontend. It is read by the skateboard-ui shell (`createSkateboardApp`) and by the build-time Vite plugins that generate `manifest.json`, `robots.txt`, and `sitemap.xml`.

```json
{
  "version": "0.1.0",
  "design": {
    "baseColor": "neutral",
    "radius": "medium",
    "font": "geist",
    "iconLibrary": "lucide"
  },
  "appName": "Test App",
  "appIcon": "command",
  "tagline": "Try Something New",
  "cta": "Get Started",
  "ctaHeading": "Ready to Get Started?",
  "noLogin": false,
  "authOverlay": true,
  "sidebarCollapsed": false,
  "features": {
    "title": "Everything You Need",
    "items": [
      { "icon": "lock", "title": "Authentication", "description": "..." },
      { "icon": "credit-card", "title": "Stripe Payments", "description": "..." },
      { "icon": "palette", "title": "Beautiful UI", "description": "..." }
    ]
  },
  "backendURL": "/api",
  "devBackendURL": "http://localhost:8000/api",
  "pages": [
    { "title": "Dashboard", "url": "home", "icon": "layout-dashboard" },
    { "title": "Analytics", "url": "analytics", "icon": "chart-bar" },
    { "title": "Projects", "url": "projects", "icon": "folder" },
    { "title": "Team", "url": "team", "icon": "users" }
  ],
  "stripeProducts": [
    {
      "price": "$5.00",
      "title": "Unlimited",
      "interval": "month",
      "lookup_key": "my_lookup_key",
      "features": ["Unlimited Todos", "Unlimited Messages", "All Premium Features"]
    }
  ],
  "pricing": {
    "title": "Simple, Transparent Pricing",
    "extras": ["Priority Customer Support", "Cancel Anytime"]
  },
  "navLinks": [
    { "label": "Features", "href": "#features" },
    { "label": "Pricing", "href": "#pricing" }
  ],
  "footerLinks": [
    { "label": "Privacy", "href": "/privacy" },
    { "label": "Terms", "href": "/terms" },
    { "label": "EULA", "href": "/eula" }
  ],
  "copyrightText": "All rights reserved.",
  "companyName": "Company Inc",
  "companyWebsite": "company.com",
  "companyEmail": "support@company.com",
  "termsOfService": "…long legal text…",
  "subscriptionDetails": "…long legal text…",
  "privacyPolicy": "…long legal text…",
  "EULA": "…long legal text…"
}
```

### Key reference

| Key | Type | Purpose |
|---|---|---|
| `version` | string | App version stamp. Note: this is separate from `package.json`'s `version`/`skateboardVersion`. |
| `design` | object | Theme generation: `baseColor`, `radius`, `font`, `iconLibrary`. Extend within it — don't override the design system. |
| `appName` | string | Display name. Also fills `manifest.json` name/short_name and the `{{APP_NAME}}` token in `index.html`. |
| `appIcon` | string | Lucide icon name (e.g. `"command"`), rendered via `DynamicIcon`. |
| `tagline` | string | Hero tagline. Fills `manifest.json` description and the `{{TAGLINE}}` token. |
| `cta` | string | Call-to-action button label on the landing page. |
| `ctaHeading` | string | Heading on the landing-page CTA banner. |
| `noLogin` | boolean | Shell auth toggle — disables the login requirement when `true`. |
| `authOverlay` | boolean | Shows the in-app auth overlay when `true`. |
| `sidebarCollapsed` | boolean | Initial collapsed state of the sidebar. |
| `features` | object | `{ title, items: [{ icon, title, description }] }` — drives the landing Features grid. |
| `backendURL` | string | Production API base (e.g. `"/api"` for a single deployment, or a full URL). |
| `devBackendURL` | string | Dev API base — `"http://localhost:8000/api"`. Used instead of a Vite proxy. |
| `pages` | array | Sidebar + Cmd+K command entries: `{ title, url, icon }`. |
| `stripeProducts` | array | Pricing products: `{ price, title, interval, lookup_key, features[] }`. Referenced by Stripe `lookup_key`, not a price/product ID. |
| `pricing` | object | `{ title, extras[] }` — landing pricing card heading and extra bullet points. |
| `navLinks` | array | Landing header links: `{ label, href }`. |
| `footerLinks` | array | Landing footer links: `{ label, href }`. |
| `copyrightText` | string | Footer copyright line. |
| `companyName` | string | Replaces `_COMPANY_` token in legal text; shown in footer. |
| `companyWebsite` | string | Replaces `_WEBSITE_` token in legal text; fills `{{COMPANY_WEBSITE}}`. |
| `companyEmail` | string | Replaces `_EMAIL_` token in legal text. |
| `termsOfService` | string | Long-form legal body for `/terms`. Supports `_COMPANY_` / `_WEBSITE_` / `_EMAIL_` tokens. |
| `subscriptionDetails` | string | Subscription terms (used on `/subs`). Token-substituted. |
| `privacyPolicy` | string | Long-form legal body for `/privacy`. Token-substituted. |
| `EULA` | string | Long-form legal body for `/eula`. Token-substituted. |

> Routing note: the routes in `pages` are mounted by the shell under `/app/` (e.g. `home` → `/app/home`). The `chat` and `calendar-test` routes exist in code but are intentionally not in `pages`, so they have no sidebar or command-palette entry.

---

## Backend Configuration (`backend/config.json`)

The backend is a Node.js + Hono server. Its config is small and selects the database.

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

| Key | Purpose |
|---|---|
| `staticDir` | Directory served as static files / SPA fallback. Defaults to `../dist` (the Vite build output). |
| `database.db` | Logical database/schema name. |
| `database.dbType` | `"sqlite"` (default), `"postgresql"` (`"postgres"`), or `"mongodb"` (`"mongo"`). |
| `database.connectionString` | Connection target. Supports `${VAR}` env-var interpolation. |

### Switching databases

The active database is chosen by `database.dbType` — **not** by an environment variable. Setting `MONGODB_URL` or `POSTGRES_URL` alone does not switch the database; those vars only resolve `${VAR}` placeholders inside `connectionString`. To change databases, edit `config.json`:

```json
// SQLite (default)
{ "database": { "db": "MyApp", "dbType": "sqlite", "connectionString": "./databases/MyApp.db" } }

// PostgreSQL
{ "database": { "db": "MyApp", "dbType": "postgresql", "connectionString": "${POSTGRES_URL}" } }

// MongoDB
{ "database": { "db": "SkateboardApp", "dbType": "mongodb", "connectionString": "${MONGODB_URL}" } }
```

> The PostgreSQL and MongoDB drivers (`pg`, `mongodb`) are loaded lazily and are not declared in `backend/package.json`. A SQLite-only deployment runs without them; if you switch to Postgres/Mongo, ensure the driver is installed.

---

## Environment Variables (`backend/.env`)

There is **no frontend `.env`** — the frontend reads `backendURL` / `devBackendURL` from `constants.json`, and there is no client-side Stripe (no publishable key). All env vars are backend-only.

Skateboard loads env without `dotenv`: it reads `backend/.env`, then `backend/.env.local` (overrides), and creates `.env` from `.env.example` if missing. This only runs when `NODE_ENV` is not `production`.

### `backend/.env.example`

```bash
# Skateboard Backend Environment Configuration
# Copy to .env and replace with actual values

# Database
# SQLite (default): comment out MONGODB_URL and POSTGRES_URL

# MongoDB: uncomment MONGODB_URL
# MONGODB_URL=mongodb://localhost:27017

# PostgreSQL: uncomment POSTGRES_URL
# POSTGRES_URL=postgresql://username:password@localhost:5432/skateboard

# Stripe payments
STRIPE_KEY=sk_test_your_stripe_secret_key_here
STRIPE_ENDPOINT_SECRET=whsec_your_webhook_endpoint_secret_here

# JWT authentication
JWT_SECRET=your_super_secure_jwt_secret_here_make_it_long_and_random

# Usage limits
FREE_USAGE_LIMIT=20

# Runtime
ENV=development
PORT=8000

# Production CORS and redirects
# CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
# FRONTEND_URL=https://yourdomain.com
```

### Variable reference

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `JWT_SECRET` | Yes (for auth) | — | HS256 signing/verification secret. Auth endpoints return `503` if unset. |
| `STRIPE_KEY` | For payments | — | Stripe secret key. If unset, Stripe self-disables with a warning. |
| `STRIPE_ENDPOINT_SECRET` | For payments | — | Stripe webhook signature secret. |
| `FREE_USAGE_LIMIT` | No | `20` | Free-tier usage limit over a rolling 30-day window. |
| `PORT` | No | `8000` | HTTP listen port. |
| `NODE_ENV` | No | — | `=== "production"` enables prod behavior (secure cookies, skips local `.env` loading). |
| `CORS_ORIGINS` | Production | localhost fallbacks | Comma-separated allowed origins. Falls back to `localhost:5173/8000` + `127.0.0.1` variants. |
| `FRONTEND_URL` | Production | request origin | Base URL for Stripe success/cancel/return redirects. |
| `MONGODB_URL` | If using Mongo | — | Resolves `${MONGODB_URL}` in `connectionString`. Commented out by default. |
| `POSTGRES_URL` | If using Postgres | — | Resolves `${POSTGRES_URL}` in `connectionString`. Commented out by default. |
| `DATABASE_URL` | If using generic DB | — | Generic DB connection; referenced in validation hints only. Not in `.env.example`. |
| `ENV` | No | `development` | Present in `.env.example` but **not read** by the server — `NODE_ENV` is used for runtime checks. |

> Startup validation warns (it does not exit) if `STRIPE_KEY`, `STRIPE_ENDPOINT_SECRET`, or `JWT_SECRET` are missing, and if any `${VAR}` in the DB connection string is unresolved.

---

## Styling

The entire app-owned stylesheet lives in `src/assets/styles.css`. It imports the shell's theme and adds a single brand override plus design tokens.

```css
@import "@stevederico/skateboard-ui/styles.css";

@source '../../node_modules/@stevederico/skateboard-ui';

@theme {
  --color-app: var(--color-purple-500);
}
```

| Piece | What it does |
|---|---|
| `@import` | Pulls the full shadcn/theme base from the skateboard-ui shell. |
| `@source` | Tells Tailwind v4 to scan the shell package for class names. |
| `@theme { --color-app }` | The one brand override — drives `bg-app` / `text-app` (purple by default). |

The file also includes dark-mode token tweaks (`.dark { --card; --accent }`), status color tokens (`--color-success`, `--color-warning`, `--color-info`), and utility layers for the typography scale (`text-heading-*`, `text-label-*`, `text-copy-*`) and elevation (`material-base` through `material-modal`).

> Tailwind CSS v4 runs via the `@tailwindcss/vite` plugin only. There is no PostCSS, no `tailwind.config.js`, and no autoprefixer. Use semantic tokens (`bg-background`, `text-foreground`, `border-border`) rather than raw colors.

---

## App Metadata (build-time)

`public/manifest.json`, `robots.txt`, and `sitemap.xml` ship as placeholder files but are **overwritten at build time** by Vite plugins that read `constants.json`. You generally don't edit the static files — change `appName`, `tagline`, and `companyWebsite` in `constants.json` instead.

The `index.html` token replacements (`{{APP_NAME}}`, `{{TAGLINE}}`, `{{COMPANY_WEBSITE}}`) are likewise filled from `constants.json` during the build.

---

## Where to go next

- [Authentication]({{ '/authentication' | relative_url }}) — JWT cookies, CSRF, scrypt hashing, lockout.
- [API Reference]({{ '/api' | relative_url }}) — every backend endpoint.
- [Stripe]({{ '/stripe' | relative_url }}) — products, checkout, portal, webhooks.
- [Deployment]({{ '/deployment' | relative_url }}) — production env vars and platform setup.
