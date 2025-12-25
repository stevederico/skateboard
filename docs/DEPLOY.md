# Deployment Guide

Deploy your Skateboard app to production.

## Prerequisites

- GitHub repository with your Skateboard app
- Stripe account (for payments)
- Hosting account (Vercel, Render, or Netlify)

## Environment Variables

All platforms require these environment variables:

```bash
# Required
JWT_SECRET=your_super_secure_jwt_secret_here
STRIPE_KEY=sk_test_your_stripe_secret_key
STRIPE_ENDPOINT_SECRET=whsec_your_webhook_secret
CORS_ORIGINS=https://yourapp.com
FRONTEND_URL=https://yourapp.com

# Optional
POSTGRES_URL=postgresql://...  # If using PostgreSQL
MONGODB_URL=mongodb://...      # If using MongoDB
FREE_USAGE_LIMIT=20            # Monthly limit for free users
```

## Stripe Webhook Setup

For all platforms, configure your Stripe webhook:

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) → Developers → Webhooks
2. Click "Add endpoint"
3. URL: `https://your-backend-url/api/payment`
4. Select events:
   - `customer.subscription.created`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`
5. Copy the signing secret to `STRIPE_ENDPOINT_SECRET`

---

## Vercel (Recommended)

Single deployment for both frontend and backend.

### 1. Create vercel.json

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

### 2. Update Backend for Vercel

Add to end of `backend/server.js`:

```javascript
export default app;
```

### 3. Deploy

1. Go to [vercel.com](https://vercel.com) → New Project
2. Import your GitHub repository
3. Configure:
   - Framework Preset: Other
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Add environment variables
5. Deploy

### 4. Update Configuration

Update `src/constants.json`:
```json
{ "backendURL": "/api" }
```

Update `backend/config.json`:
```json
{
  "client": "https://yourproject.vercel.app",
  "database": { ... }
}
```

---

## Render

Separate services for frontend (Static Site) and backend (Web Service).

### 1. Deploy Backend

1. Go to [render.com](https://render.com) → New → Web Service
2. Connect your GitHub repository
3. Configure:
   - Name: `skateboard-backend`
   - Root Directory: `backend`
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Add environment variables
5. Deploy and copy the backend URL

### 2. Deploy Frontend

1. Go to Render → New → Static Site
2. Connect the same repository
3. Configure:
   - Name: `skateboard-frontend`
   - Build Command: `npm run build`
   - Publish Directory: `dist`
4. Deploy

### 3. Update Configuration

Update `src/constants.json`:
```json
{ "backendURL": "https://skateboard-backend.onrender.com" }
```

Update `backend/config.json`:
```json
{
  "client": "https://skateboard-frontend.onrender.com",
  "database": { ... }
}
```

---

## Netlify + Railway

Netlify for frontend, Railway for backend.

### 1. Deploy Backend to Railway

1. Go to [railway.app](https://railway.app) → New Project
2. Deploy from GitHub repo
3. Configure:
   - Build Command: `npm install --workspace=backend`
   - Start Command: `npm run --workspace=backend start`
4. Add environment variables
5. Deploy and copy the backend URL

### 2. Deploy Frontend to Netlify

1. Go to [netlify.com](https://netlify.com) → New site from Git
2. Connect your GitHub repository
3. Configure:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Deploy

### 3. Update Configuration

Update `src/constants.json`:
```json
{ "backendURL": "https://yourapp.up.railway.app" }
```

Update `backend/config.json`:
```json
{
  "client": "https://random-name.netlify.app",
  "database": { ... }
}
```

---

## Docker Deployment

Use the included Dockerfile for container deployments.

```bash
docker build -t skateboard .
docker run -p 8000:8000 --env-file .env skateboard
```

See [ARCHITECTURE.md](ARCHITECTURE.md#production-configuration) for environment configuration.

---

## Go Live Checklist

- [ ] Environment variables set on hosting platform
- [ ] `constants.json` backendURL updated
- [ ] `config.json` client URL updated
- [ ] Stripe webhook configured with production URL
- [ ] Live Stripe keys configured (`sk_live_...`)
- [ ] Test sign up / sign in flow
- [ ] Test payment flow
- [ ] Monitor logs for errors

## Troubleshooting

**API routes not working?**
- Check CORS_ORIGINS includes your frontend URL
- Verify backendURL in constants.json

**Stripe webhooks failing?**
- Verify webhook URL ends with `/api/payment`
- Check STRIPE_ENDPOINT_SECRET matches

**Auth not persisting?**
- Check FRONTEND_URL is set correctly
- Verify cookies are being sent (credentials: include)
