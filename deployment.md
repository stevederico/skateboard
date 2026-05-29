---
layout: default
title: Deployment
description: Deploy your Skateboard app to production — Vercel, Render, Netlify + Railway, or Docker, with exact commands and config
---

# Deployment

Skateboard is a monorepo: a Vite-built React frontend (served as static files from `dist`) and a Node.js + Hono backend (`backend/server.js`) that defaults to SQLite. Pick one of the supported paths below — a single combined deployment (Vercel or Docker) or a split frontend/backend deployment (Render, or Netlify + Railway).

## Before You Deploy

Set these on whichever host runs the **backend**:

```bash
JWT_SECRET=your_secure_jwt_secret        # required — HS256 signing key; auth returns 503 if unset
STRIPE_KEY=sk_live_your_stripe_key       # required for payments — Stripe self-disables if unset
STRIPE_ENDPOINT_SECRET=whsec_...         # required for webhooks
CORS_ORIGINS=https://yourapp.com,https://www.yourapp.com   # allowed frontend origins (CORS)
FRONTEND_URL=https://yourapp.com         # base for Stripe success/cancel/return URLs
PORT=8000                                # default 8000
FREE_USAGE_LIMIT=20                      # optional, default 20

# Database — only if not using the default SQLite (set the matching dbType in backend/config.json):
# POSTGRES_URL=postgresql://user:pass@host:5432/db
# MONGODB_URL=mongodb+srv://...
```

Notes:

- There is **no client-side Stripe** and **no `VITE_*` build vars**. The frontend reaches the backend via `backendURL` in `src/constants.json`, not an env var.
- CORS is controlled by the **`CORS_ORIGINS` env var** on the backend (comma-separated origins); it falls back to localhost defaults when unset. The backend does **not** read a `client` key from `backend/config.json` — that file only holds `staticDir` and the `database` block.
- Database selection is driven by `backend/config.json` (`database.dbType`), not by env vars. Env vars only fill `${VAR}` placeholders in the `connectionString`. The default config is SQLite at `./databases/MyApp.db`.
- Point your Stripe webhook at `https://your-backend-url/api/payment` and subscribe to `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `checkout.session.completed`, `invoice.paid`, and `invoice.payment_failed`.

See [Configuration](/configuration) for the full `constants.json` / `config.json` reference, [Stripe](/stripe) for webhook setup, and [Authentication](/authentication) for the cookie/CSRF model.

## Vercel (single deployment, frontend + backend)

The recommended path — frontend and backend ship together.

### 1. Add `vercel.json`

```json
{
  "version": 2,
  "builds": [
    { "src": "backend/server.js", "use": "@vercel/node" },
    { "src": "package.json", "use": "@vercel/static-build" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "backend/server.js" },
    { "src": "/(.*)", "dest": "$1" }
  ],
  "buildCommand": "npm run build"
}
```

### 2. Export the Hono app

Add this to the end of `backend/server.js` so Vercel can mount it:

```javascript
export default app;
```

### 3. Import the project

In the Vercel dashboard: New Project → import your GitHub repo → Framework Preset **Other**, Build Command `npm run build`, Output Directory `dist` → add the env vars listed above (including `CORS_ORIGINS=https://yourproject.vercel.app`) → Deploy.

### 4. Point the frontend at the backend

```jsonc
// src/constants.json
{ "backendURL": "/api" }
```

Frontend and backend share the same Vercel origin, so set `CORS_ORIGINS` to that origin on the backend. The `backend/config.json` `database` block stays as the SQLite default unless you switch databases.

## Render (static site + web service)

Split deployment: a Static Site for the frontend and a Web Service for the backend.

### Backend (Web Service)

render.com → New → Web Service → connect repo:

- Name: `skateboard-backend`
- Root Directory: `backend`
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`

Add the env vars (set `CORS_ORIGINS=https://skateboard-frontend.onrender.com`), deploy, and copy the service URL.

### Frontend (Static Site)

New → Static Site → same repo:

- Name: `skateboard-frontend`
- Build Command: `npm run build`
- Publish Directory: `dist`

### Config

```jsonc
// src/constants.json
{ "backendURL": "https://skateboard-backend.onrender.com" }
```

```bash
# backend env (CORS) — allow the static-site origin
CORS_ORIGINS=https://skateboard-frontend.onrender.com
```

## Netlify + Railway (frontend on Netlify, backend on Railway)

### Backend (Railway)

railway.app → New Project → Deploy from GitHub repo:

- Build Command: `npm install --workspace=backend`
- Start Command: `npm run --workspace=backend start`

Add the env vars (set `CORS_ORIGINS` to your Netlify origin), deploy, and copy the public URL.

### Frontend (Netlify)

netlify.com → New site from Git → connect repo:

- Build Command: `npm run build`
- Publish Directory: `dist`

### Config

```jsonc
// src/constants.json
{ "backendURL": "https://yourapp.up.railway.app" }
```

```bash
# backend env (CORS) — allow the Netlify origin
CORS_ORIGINS=https://random-name.netlify.app
```

## Docker

A `Dockerfile` ships with the repo: a multi-stage build on `node:22-alpine` that builds the frontend, copies the backend, exposes port `8000`, and runs the server with the SQLite flag (`node --experimental-sqlite backend/server.js`). It includes a healthcheck against `/api/health`.

```bash
docker build -t skateboard .
docker run -p 8000:8000 --env-file .env skateboard
```

The container serves both the static frontend (from `dist`) and the API on port `8000`.

## Database Configuration

The backend ships with three adapters (`backend/adapters/{sqlite,postgres,mongodb}.js`) selected by `backend/config.json`:

```jsonc
// SQLite (default)
{ "dbType": "sqlite",     "connectionString": "./databases/MyApp.db" }

// PostgreSQL
{ "dbType": "postgresql", "connectionString": "${POSTGRES_URL}" }

// MongoDB
{ "dbType": "mongodb",    "connectionString": "${MONGODB_URL}", "db": "SkateboardApp" }
```

Switching databases requires editing both `dbType` and `connectionString` in `config.json`; setting `POSTGRES_URL` / `MONGODB_URL` alone does not auto-switch. The `pg` and `mongodb` drivers are loaded lazily, so SQLite-only deployments don't need them installed. See [Configuration](/configuration) and the [API reference](/api) for schema details.

## Go-Live Checklist

- [ ] Backend env vars set: `JWT_SECRET`, `STRIPE_KEY`, `STRIPE_ENDPOINT_SECRET`, `CORS_ORIGINS`, `FRONTEND_URL`
- [ ] `src/constants.json` → `backendURL` points at the production backend (`/api` for Vercel, full URL otherwise)
- [ ] `CORS_ORIGINS` includes the exact production frontend origin(s)
- [ ] `backend/config.json` → `dbType` / `connectionString` set for your production database
- [ ] Stripe webhook configured with the production URL `https://your-backend-url/api/payment`
- [ ] Live Stripe keys in use (`sk_live_...`)
- [ ] `GET /api/health` returns `{ "status": "ok", "timestamp": <ms> }`
- [ ] Test signup / signin end to end
- [ ] Test a checkout and the customer portal
- [ ] Monitor backend logs after first deploy

## Troubleshooting

**Auth returns 503**
`JWT_SECRET` is not set on the backend. Set it and redeploy.

**CORS errors**
`CORS_ORIGINS` must list the exact frontend origin, including scheme and subdomain. The backend reads this env var only (it does not read a `client` key from `backend/config.json`).

**401 redirects to /signout**
The `token` HttpOnly cookie isn't being sent. Confirm the frontend and backend share a domain (or that cross-site cookies are allowed) and that requests use `credentials: 'include'` — `apiRequest` does this automatically.

**Stripe webhook failures**
Verify the endpoint URL is `https://your-backend-url/api/payment`, that `STRIPE_ENDPOINT_SECRET` matches the signing secret, and that the endpoint is publicly reachable.

**Database connection issues**
Confirm `dbType` and `connectionString` in `backend/config.json` match your provider, and that any `${VAR}` placeholder resolves to a set env var (an unresolved placeholder is logged as a warning at startup).
