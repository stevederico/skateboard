---
layout: default
title: Authentication
description: JWT auth with scrypt hashing, HttpOnly cookies, CSRF protection, and protected routes
---

# Authentication

Skateboard ships a complete authentication system built into the Hono backend: sign-up, sign-in, sign-out, protected routes, account lockout, and CSRF protection. There are no external auth dependencies — JWT signing and password hashing use Node's built-in `node:crypto`.

## Overview

The authentication system provides:

- User registration and login (`/api/signup`, `/api/signin`)
- Native HS256 JWT (HMAC-SHA256 via `node:crypto`, no `jsonwebtoken` dependency)
- Password hashing with **scrypt** via `node:crypto` (no bcrypt dependency)
- Legacy bcrypt verification with automatic lazy re-hash to scrypt on login
- JWT stored in an **HttpOnly cookie** (no Bearer-token path)
- CSRF protection for state-changing requests
- Account lockout after repeated failed logins
- Protected routes handled by the `@stevederico/skateboard-ui` shell

The frontend is an Application Shell: sign-in / sign-up views, auth context, and route protection all live in the `@stevederico/skateboard-ui` package. Your app does not define these views or wire `<Routes>` manually — `createSkateboardApp()` owns routing and auth.

## How auth works

### Password hashing

New passwords are hashed with **scrypt** (`node:crypto`). Hashes are stored in the format:

```
scrypt$<base64url salt>$<base64url key>
```

with a 16-byte salt and a 64-byte derived key. Verification dispatches on the stored prefix:

- `scrypt$...` → native scrypt, timing-safe comparison
- `$2...` → legacy bcrypt verify (vendored, verify-only)
- anything else → rejected

Legacy bcrypt hashes are validated by `backend/vendor/legacy-bcrypt.js` (a vendored, verify-only copy of bcryptjs). On a successful sign-in with a non-scrypt hash, the password is re-hashed with scrypt and persisted via `db.updateAuth` (best-effort lazy migration).

### JWT

Tokens are HS256, hand-rolled with `node:crypto` HMAC-SHA256 and byte-compatible with `jsonwebtoken`. The payload is `{ userID, exp }` with a **30-day** expiry. Signature verification uses `crypto.timingSafeEqual` and throws on expired tokens.

The JWT is delivered as an **HttpOnly cookie named `token`** (`sameSite: 'Strict'`, `secure` in production, 30-day `maxAge`). `authMiddleware` reads this cookie only — there is no `Authorization: Bearer` path. If `JWT_SECRET` is unset the middleware returns `503`; missing, expired, or invalid tokens return `401`.

### CSRF

A CSRF token (`crypto.randomBytes(32)` hex) is issued alongside the JWT and set as a **non-HttpOnly cookie named `csrf_token`** (`sameSite: 'Lax'`, 24-hour lifetime). State-changing requests must echo it in an `x-csrf-token` header. Validation is timing-safe, the token store auto-regenerates after a server restart, and GET requests skip the check.

CSRF protection is applied to: `PUT /api/me`, `POST /api/signout`, `POST /api/checkout`, and `POST /api/portal`. The `/api/signup` and `/api/signin` paths are excluded.

### Account lockout

Sign-in failures are tracked per email (in memory). After **5** failed attempts the account is locked for **15 minutes**, and `/api/signin` returns `429` with a `Retry-After` header.

The frontend `apiRequest` utility (from `@stevederico/skateboard-ui`) automatically includes credentials, attaches the CSRF header on mutations, and redirects to `/signout` on a `401`.

## Backend API

All endpoints are defined in `backend/server.js` under the `/api` prefix.

### POST /api/signup

Register a new user. No auth, CSRF-excluded.

**Request:**

```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

**Response (`201`)** — sets the `token` and `csrf_token` cookies:

```json
{
  "id": "user-id",
  "email": "user@example.com",
  "name": "John Doe",
  "tokenExpires": 1716940800
}
```

### POST /api/signin

Authenticate a user. No auth, CSRF-excluded.

**Request:**

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (`200`)** — sets the `token` and `csrf_token` cookies. The `subscription` block is present only for subscribers:

```json
{
  "id": "user-id",
  "email": "user@example.com",
  "name": "John Doe",
  "subscription": {
    "stripeID": "cus_...",
    "expires": 1719532800,
    "status": "active"
  },
  "tokenExpires": 1716940800
}
```

Returns `429` (with `Retry-After`) when the account is locked out.

### POST /api/signout

Sign out the current user. Requires auth and CSRF. Clears the `token` and `csrf_token` cookies.

**Response:**

```json
{ "message": "Signed out successfully" }
```

### GET /api/me

Get the current user. Requires auth (CSRF skipped for GET).

**Response** — the full user object; `404` if the user is not found:

```json
{
  "_id": "user-id",
  "email": "user@example.com",
  "name": "John Doe",
  "created_at": 1716940800,
  "subscription": {
    "stripeID": "cus_...",
    "expires": 1719532800,
    "status": "active"
  }
}
```

### PUT /api/me

Update the current user. Requires auth and CSRF. Only `name` is whitelisted (`UPDATEABLE_USER_FIELDS`).

**Request:**

```json
{ "name": "Jane Doe" }
```

**Response** — the updated user object. Returns `400` if there are no valid fields or no changes, `404` if not found.

### GET /api/health

Health check. No auth.

**Response:**

```json
{ "status": "ok", "timestamp": 1716940800000 }
```

## Protected routes

You do not write `<Routes>` or a `ProtectedRoute` component yourself. `createSkateboardApp` (from `@stevederico/skateboard-ui/App`) owns the router, auth flow, and layout. The shell auto-creates `/`, `/signin`, `/signup`, `/signout`, and the protected `/app` tree; your `appRoutes` mount under `/app/`.

```jsx
// src/main.jsx
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import constants from './constants.json';
import { lazy } from 'react';

const HomeView = lazy(() => import('./components/HomeView.jsx'));

const appRoutes = {
  home: <HomeView />,
  // ...your views
};

createSkateboardApp({
  constants,
  appRoutes,
  defaultRoute: 'home',
});
```

Unauthenticated visits to a protected route redirect to sign-in automatically.

## User context

Read the current user from the shell context via `getState()`:

```jsx
import { getState } from '@stevederico/skateboard-ui/Context';

function Profile() {
  const { state, dispatch } = getState();
  const user = state.user;

  if (!user) {
    return <div>Please sign in</div>;
  }

  return <h1>Welcome, {user.name}!</h1>;
}
```

Context actions are `SET_USER` and `CLEAR_USER`. User state is also persisted to `localStorage` (key derived from `appName`).

## Configuration

### JWT secret

Set `JWT_SECRET` in `backend/.env` (auth returns `503` until it is set):

```bash
JWT_SECRET=your_super_secure_jwt_secret_here_make_it_long_and_random
```

Environment variables are loaded manually (no dotenv): the backend reads `backend/.env` then `backend/.env.local`, and creates `.env` from `.env.example` if it is missing. This runs only outside production.

### Auth environment variables

| Variable | Purpose | Default |
|---|---|---|
| `JWT_SECRET` | HS256 signing/verification secret (required) | — |
| `PORT` | HTTP listen port | `8000` |
| `CORS_ORIGINS` | Comma-separated allowed origins (production) | localhost:5173/8000 + 127.0.0.1 variants |
| `FREE_USAGE_LIMIT` | Free-tier usage limit | `20` |
| `NODE_ENV` | `production` enables `secure` cookies | — |

`validateEnvironmentVariables()` warns (it does not exit) if `JWT_SECRET`, `STRIPE_KEY`, or `STRIPE_ENDPOINT_SECRET` is missing.

### Token expiration

The JWT expiry is `tokenExpirationDays = 30` in `backend/server.js`:

```javascript
const tokenExpirationDays = 30;
```

### Sign-up validation

Sign-up validates: `name` 1–100 chars, `email` valid and ≤254 chars, `password` 6–72 chars.

## Database schema

Credentials are stored separately from user records. The active default is SQLite (`backend/adapters/sqlite.js`), selected by `database.dbType` in `backend/config.json`. PostgreSQL and MongoDB adapters are also available.

### Users

```javascript
// SQLite columns (subscription/usage flattened, re-nested on read)
{
  _id,                    // TEXT, primary key
  email,                  // TEXT, unique, not null
  name,                   // TEXT, not null
  created_at,             // INTEGER, not null
  subscription_stripeID,  // TEXT
  subscription_expires,   // INTEGER
  subscription_status,    // TEXT
  usage_count,            // INTEGER, default 0
  usage_reset_at          // INTEGER
}
```

### Auths

```javascript
{
  email,     // TEXT, primary key
  password,  // TEXT, not null — scrypt (or legacy $2 bcrypt) hash
  userID     // TEXT, not null — FK → Users(_id)
}
```

A unique index exists on `email` for both tables. On sign-up the user row is inserted first, then the auth row; if the auth insert fails the user row is rolled back with a `DELETE`.

## Security notes

1. **Password hashing** — scrypt via `node:crypto`, timing-safe verification.
2. **JWT** — HS256, signed and verified with timing-safe comparison; 30-day expiry.
3. **Cookies** — `token` is HttpOnly + `sameSite: 'Strict'`; `secure` in production.
4. **CSRF** — `csrf_token` cookie + `x-csrf-token` header on mutations.
5. **Lockout** — 5 failed attempts locks an account for 15 minutes.
6. **In-memory stores** — CSRF and lockout state are in-memory Maps; for horizontal scaling, externalize them (e.g. Redis) or use sticky sessions.

## Troubleshooting

**`401 Unauthorized`:**
- Confirm the `token` cookie is present and being sent (`credentials: 'include'`).
- The token may have expired (30-day lifetime) — sign in again.

**`503 Service Unavailable` on auth routes:**
- `JWT_SECRET` is not set. Add it to `backend/.env`.

**`403` / CSRF errors on POST/PUT:**
- Ensure the `x-csrf-token` header matches the `csrf_token` cookie.
- After a server restart the token is regenerated automatically on the next authenticated request.

**`429 Too Many Requests` on sign-in:**
- The account is locked after 5 failed attempts. Wait 15 minutes or check the `Retry-After` header.

**CORS errors:**
- Set `CORS_ORIGINS` to your frontend origin (comma-separated for multiple). It defaults to localhost:5173/8000 + 127.0.0.1 variants for development.
