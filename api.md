---
layout: default
title: API Reference
description: Complete backend API reference for the Skateboard Hono server — every endpoint with method, path, auth, request, and response.
---

# API Reference

Complete reference for the Skateboard backend, a [Hono](https://hono.dev) server running on Node.js (`>=22.5.0`, ES modules). The server is defined entirely in `backend/server.js` and started with:

```bash
node --experimental-sqlite server.js
```

The `--experimental-sqlite` flag is required because the default SQLite adapter imports `node:sqlite` (`DatabaseSync`). From the repo root, `npm run server` delegates to the backend workspace's `start` script, and `npm run start` runs the Vite frontend and backend concurrently.

## Base URL

The server listens on the `PORT` env var (default `8000`) on both IPv4 and IPv6 (`hostname: '::'`). All API routes are prefixed with `/api`.

```
Development: http://localhost:8000
```

In the frontend, the API base is configured in `src/constants.json`:

- `devBackendURL`: `http://localhost:8000/api`
- `backendURL`: `/api` (production, same-origin)

## Authentication

Authentication uses a **JWT stored in an HttpOnly cookie named `token`** — there is no `Authorization: Bearer` header path. The cookie is set by the server on sign up / sign in and read by `authMiddleware` via the request cookies. Requests from the frontend must send credentials (`credentials: 'include'`).

- **JWT**: hand-rolled HS256 using `node:crypto` HMAC-SHA256 (no `jsonwebtoken` dependency). Payload is `{ userID, exp }`. Expiry is 30 days.
- **Cookie**: `token`, HttpOnly, `sameSite: 'Strict'`, `secure` in production, `maxAge` 30 days.
- If `JWT_SECRET` is unset, protected endpoints return `503`. A missing, expired, or invalid token returns `401`.

### CSRF protection

State-changing requests on protected routes require a CSRF token. A non-HttpOnly cookie `csrf_token` (`sameSite: 'Lax'`) is set alongside `token`, and the matching value must be sent in the `x-csrf-token` header.

- CSRF tokens are generated with `crypto.randomBytes(32)`, stored in an in-memory map (24-hour expiry, hourly cleanup, LRU eviction at 50,000 entries), and validated with `crypto.timingSafeEqual`.
- The CSRF middleware skips `GET` requests and the `/api/signup` / `/api/signin` paths.
- CSRF is only attached to: `PUT /api/me`, `POST /api/signout`, `POST /api/checkout`, `POST /api/portal`. (`POST /api/usage` is **not** CSRF-protected — it has `authMiddleware` only.)

### Account lockout

Sign-in failures are tracked in memory per email. After 5 failed attempts the account is locked for 15 minutes; locked requests return `429` with a `Retry-After` header.

## Endpoints

| Method | Path | Auth | CSRF |
|---|---|---|---|
| `GET` | `/api/health` | No | No |
| `POST` | `/api/signup` | No | No |
| `POST` | `/api/signin` | No | No |
| `POST` | `/api/signout` | Yes | Yes |
| `GET` | `/api/me` | Yes | No (GET) |
| `PUT` | `/api/me` | Yes | Yes |
| `POST` | `/api/usage` | Yes | No |
| `POST` | `/api/checkout` | Yes | Yes |
| `POST` | `/api/portal` | Yes | Yes |
| `POST` | `/api/payment` | No (Stripe signature) | No |

### Health

#### GET /api/health

Health check. No authentication.

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": 1748390400000
}
```

### Authentication

#### POST /api/signup

Register a new user. Sets the `token` and `csrf_token` cookies on success.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

**Response (201):**
```json
{
  "id": "user_123",
  "email": "user@example.com",
  "name": "John Doe",
  "tokenExpires": 1750982400000
}
```

> Signup inserts the user, then the auth record. If the auth insert fails, the user row is rolled back (`DELETE FROM Users WHERE _id = ?` on SQL adapters).

#### POST /api/signin

Authenticate an existing user. Sets the `token` and `csrf_token` cookies on success. Subject to account lockout after 5 failed attempts.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "id": "user_123",
  "email": "user@example.com",
  "name": "John Doe",
  "subscription": {
    "stripeID": "cus_1234567890",
    "expires": 1750982400,
    "status": "active"
  },
  "tokenExpires": 1750982400000
}
```

The `subscription` object is present only when the user has one.

**Response (429):** Returned when the account is locked. Includes a `Retry-After` header.

#### POST /api/signout

Sign out the current user. Clears the `token` and `csrf_token` cookies.

**Auth:** `token` cookie + `x-csrf-token` header.

**Response (200):**
```json
{
  "message": "Signed out successfully"
}
```

### User

#### GET /api/me

Get the authenticated user.

**Auth:** `token` cookie.

**Response (200):**
```json
{
  "_id": "user_123",
  "email": "user@example.com",
  "name": "John Doe",
  "created_at": 1748390400000,
  "subscription": {
    "stripeID": "cus_1234567890",
    "expires": 1750982400,
    "status": "active"
  },
  "usage": {
    "count": 3,
    "reset_at": 1750982400000
  }
}
```

**Response (404):** User not found.

#### PUT /api/me

Update the authenticated user. Only `name` is whitelisted (`UPDATEABLE_USER_FIELDS`); any other fields are ignored.

**Auth:** `token` cookie + `x-csrf-token` header.

**Request Body:**
```json
{
  "name": "John Smith"
}
```

**Response (200):** The updated user object.

**Response (400):** No valid fields supplied, or no changes made.

**Response (404):** User not found.

### Usage / Freemium

#### POST /api/usage

Check or track usage for the freemium model. Subscribers (`subscription.status === 'active'` and not expired) get unlimited usage. Free users are limited by `FREE_USAGE_LIMIT` (default `20`) over a rolling 30-day window.

**Auth:** `token` cookie. (No CSRF.)

**Request Body:**
```json
{
  "operation": "check"
}
```

`operation` is `"check"` or `"track"`. `track` atomically increments usage.

**Response (200) — subscriber:**
```json
{
  "remaining": -1,
  "total": -1,
  "isSubscriber": true,
  "subscription": {
    "stripeID": "cus_1234567890",
    "expires": 1750982400,
    "status": "active"
  }
}
```

**Response (200) — free user:**
```json
{
  "remaining": 17,
  "total": 20,
  "isSubscriber": false,
  "used": 3,
  "subscription": null
}
```

**Response (429):** Limit reached on a `track` operation.
```json
{
  "error": "Usage limit exceeded",
  "remaining": 0,
  "total": 20,
  "isSubscriber": false
}
```

### Stripe

Stripe is optional: the SDK only initializes when `STRIPE_KEY` is set, otherwise these flows are disabled with a startup warning. See the [Stripe guide]({{ '/stripe' | relative_url }}) for setup. Redirect URLs use `FRONTEND_URL` (or the request `origin`, or `http://localhost:<port>`) as the base.

#### POST /api/checkout

Create a Stripe Checkout session for a subscription. The product is resolved by Stripe **lookup key**, not a hardcoded price ID.

**Auth:** `token` cookie + `x-csrf-token` header.

**Request Body:**
```json
{
  "email": "user@example.com",
  "lookup_key": "my_lookup_key"
}
```

**Response (200):**
```json
{
  "url": "https://checkout.stripe.com/c/pay/cs_test_...",
  "id": "cs_test_1234567890",
  "customerID": "cus_1234567890"
}
```

**Errors:** `400` missing `email`/`lookup_key` or no price found for the lookup key; `403` if `email` does not match the authenticated user; `500` `{ "error": "Stripe session failed" }`.

#### POST /api/portal

Create a Stripe Billing Portal session.

**Auth:** `token` cookie + `x-csrf-token` header.

**Request Body:**
```json
{
  "customerID": "cus_1234567890"
}
```

**Response (200):**
```json
{
  "url": "https://billing.stripe.com/p/session/...",
  "id": "bps_1234567890"
}
```

**Errors:** `400` missing `customerID`; `403` if the user's stored `subscription.stripeID` exists and does not match `customerID`; `500` `{ "error": "Stripe portal failed" }`.

#### POST /api/payment

Stripe webhook endpoint. **No auth middleware** — verified instead by the `stripe-signature` header against `STRIPE_ENDPOINT_SECRET` using `stripe.webhooks.constructEventAsync`. Idempotent: each `event.id` is recorded before processing and skipped if already seen.

**Headers:**
```
stripe-signature: t=...,v1=...
```

Configure the webhook URL as `https://your-backend-url/api/payment`.

**Handled events:**

- `customer.subscription.created` / `.updated` / `.deleted` — patches `subscription` (`stripeID`, `expires`, `status`).
- `checkout.session.completed` — retrieves the subscription and patches `subscription`.
- `invoice.paid` — patches `subscription`.
- `invoice.payment_failed` — sets `subscription.paymentFailed` and `subscription.paymentFailedAt`.

**Response:** `200` on success or skip (empty body); `400` on signature/data failure; `500` on processing error.

### Static / SPA fallback

Non-`/api` routes serve static files from `config.staticDir` (`../dist`). Any non-asset, non-`/api` path returns `index.html` (SPA fallback). `/api/*` paths and paths ending in a file extension that aren't found return `404`. If `index.html` is missing, the server returns the text `Welcome to Skateboard API`.

## Database

The backend uses a unified adapter pattern (`backend/adapters/manager.js`, exported as `databaseManager`). The active database is selected by `backend/config.json` → `database.dbType` (default `"sqlite"`) — it is **not** chosen by an env var. Env vars (`MONGODB_URL`, `POSTGRES_URL`, `DATABASE_URL`) only substitute into the `connectionString` via `${VAR}` placeholders. Switching databases requires editing `config.json`.

| dbType | Adapter | Driver |
|---|---|---|
| `sqlite` (default) | `adapters/sqlite.js` | `node:sqlite` (`DatabaseSync`), WAL mode |
| `postgresql` / `postgres` | `adapters/postgres.js` (dynamic import) | `pg` Pool |
| `mongodb` / `mongo` | `adapters/mongodb.js` (dynamic import) | `mongodb` driver |

> `pg` and `mongodb` are **not** declared in `backend/package.json` dependencies; they are loaded lazily and resolved from the hoisted root `node_modules`. SQLite-only deployments work without them.

**Schema (logical):**

- **Users** — `_id`, `email` (unique), `name`, `created_at`, `subscription_stripeID`, `subscription_expires`, `subscription_status`, `usage_count`, `usage_reset_at`.
- **Auths** — `email` (PK), `password` (hash), `userID` → `Users(_id)`.
- **WebhookEvents** — `event_id` (PK), `event_type`, `processed_at`.

SQL adapters flatten `subscription`/`usage` into columns and reconstruct nested objects on read; MongoDB stores them as native nested objects.

### Password hashing

New password hashes use **node:crypto scrypt** in the format `scrypt$<base64url salt>$<base64url key>` (salt 16 bytes, key 64 bytes). Verification dispatches on the stored prefix: `scrypt$` uses a timing-safe scrypt compare; `$2` (legacy bcrypt) is verified by the vendored verify-only module at `backend/vendor/legacy-bcrypt.js` and lazily re-hashed to scrypt on successful sign in.

## Environment Variables

Loaded manually (no dotenv) from `backend/.env` then `backend/.env.local` when not in production; a missing `.env` is created from `.env.example`.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | No | `8000` | HTTP listen port |
| `JWT_SECRET` | Yes | — | HS256 JWT signing secret (`503` if missing) |
| `STRIPE_KEY` | No | — | Stripe secret key; if unset, Stripe is disabled |
| `STRIPE_ENDPOINT_SECRET` | No | — | Stripe webhook signature secret |
| `FREE_USAGE_LIMIT` | No | `20` | Free-tier usage limit |
| `NODE_ENV` | No | — | `production` enables secure cookies, disables env file loading |
| `CORS_ORIGINS` | No | localhost fallback | Comma-separated allowed origins |
| `FRONTEND_URL` | No | — | Base for Stripe success/cancel/return URLs |
| `MONGODB_URL` | No | — | MongoDB connection string (`${VAR}` substitution) |
| `POSTGRES_URL` | No | — | PostgreSQL connection string (`${VAR}` substitution) |
| `DATABASE_URL` | No | — | Generic DB connection (validation hint only) |

`validateEnvironmentVariables()` warns (does not exit) if `JWT_SECRET`, `STRIPE_KEY`, or `STRIPE_ENDPOINT_SECRET` are missing, or if the DB connection string contains an unresolved `${VAR}`.

## HTTP Status Codes

- `200` — Success
- `201` — Created (sign up)
- `400` — Bad request (missing/invalid fields, no changes)
- `401` — Unauthorized (missing/expired/invalid token)
- `403` — Forbidden (email or customer ID mismatch)
- `404` — Not found
- `429` — Too many requests (account lockout, usage limit)
- `500` — Internal server error
- `503` — Auth disabled (`JWT_SECRET` not set)

## Dependencies

`backend/package.json` declares only three runtime dependencies:

- `@hono/node-server` `^1.14.1`
- `hono` `^4.7.11`
- `stripe` `^18.5.0`

There are no backend devDependencies; tests run with Node's built-in test runner (`node --test --experimental-sqlite server.test.js`).
