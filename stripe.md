---
layout: default
title: Stripe Integration
description: Subscription billing with Stripe Checkout, Customer Portal, and signature-verified webhooks
---

# Stripe Integration

Skateboard ships with a fully wired Stripe integration for subscription billing. It handles Checkout, the Customer Portal, and signature-verified webhooks on the backend, with usage-based entitlement gating for free vs. subscribed users.

Stripe is **optional**. The SDK only initializes when `STRIPE_KEY` is set — otherwise the backend logs a warning and Stripe routes self-disable. There is **no client-side Stripe.js** and **no publishable key**; all Stripe calls happen on the server, and the frontend simply redirects to the hosted URLs that the backend returns.

## How It Works

1. A non-subscriber hits a usage limit and the shell opens the upgrade sheet.
2. The frontend `POST`s to `/api/checkout`, gets back a hosted Stripe Checkout `url`, and redirects to it.
3. The user pays on Stripe's hosted page and is sent back to `/app/payment?success=true`.
4. Stripe fires webhooks to `POST /api/payment`; the backend verifies the signature, dedupes the event, and updates the user's `subscription` record.
5. Subscribers get unlimited usage; the entitlement check lives in `POST /api/usage`.

Subscribers manage or cancel their plan through the Stripe Customer Portal via `POST /api/portal`.

## Setup

### 1. Create a Product

1. In the [Stripe Dashboard](https://dashboard.stripe.com), go to Product Catalog and create a product with a recurring price.
2. Under the price's pricing options, set a **Lookup Key** (e.g. `my_lookup_key`). Skateboard resolves prices by lookup key, never by a hardcoded price/product ID — so you can change pricing on stripe.com without touching code.

### 2. Backend Environment Variables

Stripe is configured entirely on the backend. Add these to `backend/.env`:

```env
STRIPE_KEY=sk_test_your_stripe_secret_key_here
STRIPE_ENDPOINT_SECRET=whsec_your_webhook_endpoint_secret_here
```

| Variable | Purpose |
|---|---|
| `STRIPE_KEY` | Stripe secret key. Gates SDK initialization — if unset, Stripe is disabled. |
| `STRIPE_ENDPOINT_SECRET` | Webhook signing secret, used to verify the `stripe-signature` header. |
| `FRONTEND_URL` | Base origin for Checkout/Portal success, cancel, and return URLs (optional; falls back to the request `origin`, then `http://localhost:8000`). |

Startup validation warns (but does not exit) if `STRIPE_KEY` or `STRIPE_ENDPOINT_SECRET` is missing. There is no `STRIPE_WEBHOOK_SECRET` or publishable key — those do not exist in this codebase.

### 3. Reference the Product in `constants.json`

The frontend pricing card is driven by `src/constants.json`:

```json
{
  "stripeProducts": [
    {
      "price": "$5.00",
      "title": "Unlimited",
      "interval": "month",
      "lookup_key": "my_lookup_key",
      "features": [
        "Unlimited Todos",
        "Unlimited Messages",
        "All Premium Features"
      ]
    }
  ],
  "pricing": {
    "title": "Simple, Transparent Pricing",
    "extras": ["Priority Customer Support", "Cancel Anytime"]
  }
}
```

The `lookup_key` here must match the lookup key you set in Stripe. `backend/config.json` contains **no** Stripe fields — only `staticDir` and the `database` block.

## Backend API

All endpoints live in `backend/server.js` and are prefixed with `/api`. Auth means a valid JWT in the HttpOnly `token` cookie; CSRF means an `x-csrf-token` header matching the stored token.

### POST /api/checkout

Creates a subscription Checkout session. Middleware: `authMiddleware`, `csrfProtection`.

**Request:**
```json
{
  "email": "user@example.com",
  "lookup_key": "my_lookup_key"
}
```

The backend validates both fields (`400` if missing) and confirms `email` matches the authenticated user (`403` "Email mismatch" otherwise). It resolves the price from the `lookup_key` (`400` if no price found), then creates a `subscription`-mode Checkout session with:

- `success_url`: `${origin}/app/payment?success=true`
- `cancel_url`: `${origin}/app/payment?canceled=true`

**Response:**
```json
{
  "url": "https://checkout.stripe.com/c/pay/cs_test_...",
  "id": "cs_test_...",
  "customerID": "cus_..."
}
```

On failure: `500` `{ "error": "Stripe session failed" }`.

### POST /api/portal

Creates a Stripe Customer Portal session. Middleware: `authMiddleware`, `csrfProtection`.

**Request:**
```json
{
  "customerID": "cus_..."
}
```

`400` if `customerID` is missing. `403` "Unauthorized customerID" if the user already has a `subscription.stripeID` that does not match. The return URL is `${origin}/app/payment?portal=return`.

**Response:**
```json
{
  "url": "https://billing.stripe.com/p/session/...",
  "id": "bps_..."
}
```

On failure: `500` `{ "error": "Stripe portal failed" }`.

### POST /api/payment

The Stripe webhook handler. **No auth middleware** — it is verified by Stripe signature instead.

The handler reads the raw request body, verifies it against the `stripe-signature` header using `STRIPE_ENDPOINT_SECRET` (`400` on failure), and is idempotent: it skips events whose `event.id` has already been recorded and inserts the event into `WebhookEvents` before processing.

**Headers:**
```
stripe-signature: t=...,v1=...
```

Responds `200` on success or skip, `400` on missing data, `500` on a processing error.

## Webhook Events

Configure the endpoint in the Stripe Dashboard under Developers → Webhooks → Add Endpoint, pointing the URL at your deployed backend:

```
https://your-backend-url/api/payment
```

The handler processes these events:

| Event | Behavior |
|---|---|
| `customer.subscription.created` | Patches the user's `subscription` with `{ stripeID, expires, status }`. |
| `customer.subscription.updated` | Same patch as above. |
| `customer.subscription.deleted` | Same patch as above. |
| `checkout.session.completed` | If a subscription + customer are present, retrieves the subscription and patches `subscription`. |
| `invoice.paid` | Retrieves the subscription, resolves the email, and patches `subscription`. |
| `invoice.payment_failed` | Sets `subscription.paymentFailed = true` and `subscription.paymentFailedAt`. |

If no matching user is found, the patch is a silent no-op (the handler still returns success so Stripe does not retry).

## Subscription & Entitlement Model

Each user document holds a `subscription` object:

```json
{
  "subscription": {
    "stripeID": "cus_...",
    "expires": 1735689600,
    "status": "active"
  }
}
```

- `stripeID` — the Stripe customer ID.
- `expires` — unix seconds, from the subscription's `current_period_end`.
- `status` — Stripe subscription status (e.g. `active`, `canceled`, `past_due`).
- `paymentFailed` / `paymentFailedAt` — set on `invoice.payment_failed`.

SQL adapters (SQLite, PostgreSQL) flatten this into `subscription_stripeID`, `subscription_expires`, and `subscription_status` columns and re-nest on read; MongoDB stores it nested.

### Entitlement Gate

The check lives in `POST /api/usage`:

```javascript
const isSubscriber =
  subscription?.status === 'active' && (!expires || expires > now);
```

- **Subscribers** get unlimited usage: `{ remaining: -1, total: -1, isSubscriber: true }`.
- **Free users** are limited by `FREE_USAGE_LIMIT` (default `20`) over a rolling 30-day window. The backend does an atomic increment, rolls back, and returns `429` if the limit is exceeded.

`GET /api/me` includes the `subscription` block (`stripeID`, `expires`, `status`) in its response.

## Frontend Integration

The Checkout and Portal UI live in the `@stevederico/skateboard-ui` shell package, not in your app's `src/`. You typically do not call these endpoints directly — the shell does it for you.

- `UpgradeSheet` — the upgrade drawer. Its `handleUpgrade` calls `showCheckout(userEmail)`.
- `showCheckout(email, productIndex = 0)` (from the shell's Utilities) — `POST`s to `/checkout` with `{ lookup_key, email }`, including the CSRF token and credentials, saves the current URL, then sets `window.location.href = data.url`.
- `showManage(stripeID)` — `POST`s to `/portal` with `{ customerID }`, then redirects to the returned portal URL.
- `PaymentView` — handles the return query params (`success`, `canceled`, `portal=return`) and redirects the user back to where they left off.

Your app's `LandingSpecSheet.jsx` only *displays* the pricing card from `constants.stripeProducts[0]`; its CTA navigates to `/app`, not to Checkout.

### Gating an Action with Usage

The included `ChatView` demonstrates the pattern: it reads remaining usage, opens the `UpgradeSheet` when a non-subscriber's `remaining` hits `0`, and tracks usage on each action via the shell's `trackUsage` utility.

## Testing

### Test Cards

Use Stripe's test card numbers in test mode:

- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **3D Secure**: `4000 0025 0000 3155`

### Local Webhook Forwarding

```bash
# Install the Stripe CLI
brew install stripe/stripe-cli/stripe

# Log in
stripe login

# Forward webhooks to the local backend (port 8000)
stripe listen --forward-to localhost:8000/api/payment
```

The CLI prints a webhook signing secret — set it as `STRIPE_ENDPOINT_SECRET` in `backend/.env` while testing locally.

## Security Notes

1. **Server-side only** — there is no client Stripe.js and no publishable key. The secret key never reaches the browser.
2. **Signature verification** — `/api/payment` rejects any event whose signature does not validate against `STRIPE_ENDPOINT_SECRET`.
3. **Idempotency** — every webhook event is deduped by `event.id` before processing.
4. **Authorization** — `/api/checkout` enforces email match; `/api/portal` enforces customer-ID ownership.
5. **HTTPS** — always serve the webhook endpoint over HTTPS in production.

## Common Issues

### Stripe routes do nothing
`STRIPE_KEY` is unset. The SDK self-disables and logs a warning at startup. Set the key in `backend/.env`.

### Webhook signature failures
- Confirm `STRIPE_ENDPOINT_SECRET` matches the signing secret for that exact endpoint (or the Stripe CLI's secret when testing locally).
- Ensure the endpoint URL is `https://your-backend-url/api/payment` (note the `/api` prefix).

### Checkout returns 403
- "Email mismatch" — the `email` in the request does not match the authenticated user.
- For `/api/portal`, "Unauthorized customerID" — the `customerID` does not match the user's stored `subscription.stripeID`.

### Subscription not updating after payment
- Verify the webhook endpoint is reachable and registered for the `customer.subscription.*`, `checkout.session.completed`, `invoice.paid`, and `invoice.payment_failed` events.
- Check the backend logs for signature or processing errors.

## See Also

- [Configuration]({{ '/configuration' | relative_url }}) — `constants.json` and `backend/config.json`
- [Authentication]({{ '/authentication' | relative_url }}) — JWT cookies and CSRF
- [API]({{ '/api' | relative_url }}) — full endpoint reference
- [Deployment]({{ '/deployment' | relative_url }}) — setting the production webhook URL
