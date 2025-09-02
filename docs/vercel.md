# Skateboard Deployment Guide

This guide walks you through deploying your Skateboard app to production using Vercel.

## Prerequisites

- GitHub repository with your Skateboard app
- Stripe account (for payments)
- Vercel account (free tier works great)

## Step 1: Prepare for Vercel Deployment

### Create vercel.json Configuration

Create `vercel.json` in your project root:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "backend/server.js",
      "use": "@vercel/node"
    },
    {
      "src": "package.json",
      "use": "@vercel/static-build"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "backend/server.js"
    },
    {
      "src": "/(.*)",
      "dest": "$1"
    }
  ],
  "buildCommand": "npm run build"
}
```

### Update Backend for Vercel

Add this line to the end of `backend/server.js`:

```javascript
// For Vercel deployment
export default app;
```

## Step 2: Deploy to Vercel

### Deploy Your App

1. **Create Vercel Account**
   - Go to [vercel.com](https://vercel.com)
   - Sign in with GitHub

2. **Deploy Project**
   - Click "New Project"
   - Select your skateboard repository
   - Framework Preset: "Other"
   - Root Directory: Leave blank
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

3. **Add Environment Variables**
   - Go to Project Settings → Environment Variables
   - Add these variables:
   ```
   JWT_SECRET=your_super_secure_jwt_secret_here_make_it_long_and_random
   STRIPE_KEY=sk_test_your_stripe_secret_key
   STRIPE_ENDPOINT_SECRET=whsec_your_webhook_endpoint_secret
   ```

4. **Optional: Add Database Variables**
   - For PostgreSQL: `POSTGRES_URL=your_connection_string`
   - For MongoDB: `MONGODB_URL=your_connection_string`
   - Leave blank to use SQLite (default)

5. **Deploy**
   - Click "Deploy"
   - Your app will be available at: `https://yourproject.vercel.app`

## Step 3: Update Configuration

### Update constants.json

Edit `src/constants.json` and change the `backendURL`:

```json
{
  "backendURL": "/api"
}
```

### Update backend/config.json

Add your Vercel frontend URL to the allowed clients:

```json
{
  "clients": [
    "https://yourproject.vercel.app"
  ],
  "databases": [
    {
      "db": "MyApp",
      "origin": "https://yourproject.vercel.app",
      "dbType": "sqlite",
      "connectionString": "./databases/MyApp.db"
    }
  ]
}
```

This configures CORS and database access for your deployed app.

## Step 4: Configure Stripe Webhooks

1. **Go to Stripe Dashboard**
   - Visit [dashboard.stripe.com](https://dashboard.stripe.com)
   - Navigate to "Developers" → "Webhooks"

2. **Add Endpoint**
   - Click "Add endpoint"
   - URL: `https://yourproject.vercel.app/api/stripe-webhook`
   - Events: Select these 3 events:
     - `customer.subscription.created`
     - `customer.subscription.deleted`
     - `customer.subscription.updated`

3. **Get Webhook Secret**
   - Click on your new webhook
   - Copy the "Signing secret" (starts with `whsec_`)
   - Update your Vercel environment variables:
     - Go to Project Settings → Environment Variables
     - Update `STRIPE_ENDPOINT_SECRET` with the new secret

## Step 5: Test Your Deployment

1. **Visit Your Frontend URL**
   - Your app should load successfully
   - Try creating an account

2. **Test Authentication**
   - Sign up for a new account
   - Verify you can sign in/out

3. **Test Payments (Optional)**
   - Go to Settings → Subscription
   - Try the checkout flow
   - Check Stripe dashboard for test payments

## Step 6: Go Live with Production Stripe

1. **Switch to Live Stripe Keys**
   - In Stripe dashboard, toggle from "Test mode" to "Live mode"
   - Copy your live secret key (starts with `sk_live_`)
   - Update your Vercel environment variables:
     - Project Settings → Environment Variables
     - Update `STRIPE_KEY` with live key

2. **Update Webhook for Production**
   - Create a new webhook endpoint for live mode
   - URL: `https://yourproject.vercel.app/api/stripe-webhook`
   - Select the same 3 events
   - Update `STRIPE_ENDPOINT_SECRET` in Vercel with the new live secret

3. **Redeploy**
   - Go to Vercel dashboard → Your project → Deployments
   - Click "Redeploy" to apply the new environment variables

4. **Final Test**
   - Test with a real payment method
   - Verify everything works in production

## Troubleshooting

**Build fails on Vercel?**
- Check that `vercel.json` is in the project root
- Verify backend/server.js has the export default line
- Ensure environment variables are set

**API routes not working?**
- Verify `vercel.json` routing configuration
- Check that URLs use `/api/` prefix
- Ensure `constants.json` has `"backendURL": "/api"`

**Stripe webhooks failing?**
- Verify webhook URL: `https://yourproject.vercel.app/api/stripe-webhook`
- Check webhook secret matches environment variable
- Ensure events are selected correctly

**Database not connecting?**
- For SQLite: Should work automatically on Vercel
- For PostgreSQL/MongoDB: Verify connection string format
- Check Vercel function logs for connection errors

## Production Checklist

- [ ] `vercel.json` created and configured
- [ ] Backend server.js exports default app
- [ ] Environment variables set in Vercel
- [ ] `constants.json` updated with `/api` backend URL
- [ ] Stripe webhooks configured with Vercel URL
- [ ] Live Stripe keys configured
- [ ] App deployed successfully
- [ ] Test complete user flow
- [ ] Monitor Vercel function logs

## Vercel Benefits

- **Automatic HTTPS** - All deployments are secure
- **Global CDN** - Fast loading worldwide
- **Serverless Functions** - Auto-scaling backend
- **Git Integration** - Deploy on every push
- **Free Tier** - Great for small apps

Your Skateboard app is now live on Vercel! 🚀