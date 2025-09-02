# Skateboard Deployment Guide - Render

This guide walks you through deploying your Skateboard app to Render with separate frontend and backend services.

## Prerequisites

- GitHub repository with your Skateboard app
- Stripe account (for payments)
- Render account (free tier available)

## Step 1: Deploy Backend to Render

### Create Backend Service

1. **Create Render Account**
   - Go to [render.com](https://render.com)
   - Sign in with GitHub

2. **Create Web Service**
   - Click "New" → "Web Service"
   - Connect your GitHub repository
   - Select your skateboard repo

3. **Configure Backend Service**
   - **Name:** `skateboard-backend`
   - **Branch:** `master`
   - **Root Directory:** `backend`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`

4. **Add Environment Variables**
   - In service settings, add these variables:
   ```
   NODE_ENV=production
   JWT_SECRET=your_super_secure_jwt_secret_here_make_it_long_and_random
   STRIPE_KEY=sk_test_your_stripe_secret_key
   STRIPE_ENDPOINT_SECRET=whsec_your_webhook_endpoint_secret
   ```

5. **Optional: Add Database Variables**
   - For PostgreSQL: `POSTGRES_URL=your_connection_string`
   - For MongoDB: `MONGODB_URL=your_connection_string`
   - Leave blank to use SQLite (default)

6. **Deploy Backend**
   - Click "Create Web Service"
   - Wait for deployment to complete
   - Copy your backend URL (e.g., `https://skateboard-backend.onrender.com`)

## Step 2: Configure Stripe Webhooks

1. **Go to Stripe Dashboard**
   - Visit [dashboard.stripe.com](https://dashboard.stripe.com)
   - Navigate to "Developers" → "Webhooks"

2. **Add Endpoint**
   - Click "Add endpoint"
   - URL: `https://your-backend-url.onrender.com/stripe-webhook`
   - Events: Select these 3 events:
     - `customer.subscription.created`
     - `customer.subscription.deleted`  
     - `customer.subscription.updated`

3. **Update Webhook Secret**
   - Click on your new webhook
   - Copy the "Signing secret" (starts with `whsec_`)
   - Update your Render backend environment variables:
     - Go to service settings → Environment
     - Update `STRIPE_ENDPOINT_SECRET` with the new secret

## Step 3: Deploy Frontend to Render

### Update Frontend Configuration

1. **Update constants.json**
   - Edit `src/constants.json`
   - Change `backendURL` to your Render backend URL:
   ```json
   {
     "backendURL": "https://skateboard-backend.onrender.com"
   }
   ```

### Create Frontend Service

1. **Create Static Site**
   - In Render dashboard, click "New" → "Static Site"
   - Connect the same GitHub repository

2. **Configure Frontend Service**
   - **Name:** `skateboard-frontend`
   - **Branch:** `master`
   - **Root Directory:** Leave blank
   - **Build Command:** `npm run build`
   - **Publish Directory:** `dist`

3. **Deploy Frontend**
   - Click "Create Static Site"
   - Your frontend will be available at: `https://skateboard-frontend.onrender.com`

## Step 4: Test Your Deployment

1. **Visit Your Frontend URL**
   - Your app should load successfully
   - Try creating an account

2. **Test Authentication**
   - Sign up for a new account
   - Verify you can sign in/out

3. **Test Payments**
   - Go to Settings → Subscription
   - Try the checkout flow
   - Check Stripe dashboard for test payments

## Step 5: Go Live with Production Stripe

1. **Switch to Live Stripe Keys**
   - In Stripe dashboard, toggle from "Test mode" to "Live mode"
   - Copy your live secret key (starts with `sk_live_`)
   - Update your Render backend environment variables

2. **Update Webhook for Production**
   - Create a new webhook endpoint for live mode
   - Use the same backend URL and events
   - Update `STRIPE_ENDPOINT_SECRET` with live webhook secret

3. **Redeploy Services**
   - Backend will auto-redeploy when you update environment variables
   - Frontend may need manual redeploy if you changed constants.json

## Troubleshooting

**Backend service won't start?**
- Check that `backend/package.json` has correct start script
- Verify environment variables are set correctly
- Check Render logs for specific errors

**Frontend can't connect to backend?**
- Verify `backendURL` in `constants.json` matches your Render backend URL
- Check that backend service is running and accessible
- Ensure CORS is properly configured

**Stripe webhooks failing?**
- Verify webhook URL matches your Render backend URL
- Check webhook secret matches environment variable
- Ensure all 3 subscription events are selected

**Build failures?**
- Check that dependencies are in package.json
- Verify build commands are correct for each service
- Review Render build logs for specific errors

## Production Checklist

- [ ] Backend service deployed on Render
- [ ] Frontend static site deployed on Render
- [ ] Environment variables configured
- [ ] Database connected (if not using SQLite)
- [ ] Stripe webhooks configured with Render URLs
- [ ] Live Stripe keys configured
- [ ] Test complete user flow
- [ ] Monitor service logs

## Render Benefits

- **Free Tier** - Great for getting started
- **Auto-deploys** - Deploys on every git push
- **Custom Domains** - Add your own domain
- **SSL Included** - Automatic HTTPS
- **Service Logs** - Easy debugging

Your Skateboard app is now live on Render! 🚀