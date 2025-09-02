# Skateboard Deployment Guide - Netlify + Railway

This guide walks you through deploying your Skateboard app using Netlify for the frontend and Railway for the backend.

## Prerequisites

- GitHub repository with your Skateboard app
- Stripe account (for payments)
- Netlify account (free tier available)
- Railway account (for backend hosting)

## Step 1: Deploy Backend to Railway

### Create Backend Service

1. **Create Railway Account**
   - Go to [railway.app](https://railway.app)
   - Sign in with GitHub

2. **Deploy Backend**
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your skateboard repository
   - Railway will auto-detect it's a Node.js app

3. **Configure Build Settings**
   - Railway automatically detects the monorepo structure
   - Build Command: `npm install --workspace=backend`
   - Start Command: `npm run --workspace=backend start`
   - Root Directory: Leave blank (monorepo support)

4. **Add Environment Variables**
   - In Railway project settings, add these variables:
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
   - Click "Deploy"
   - Copy your backend URL (e.g., `https://yourapp.up.railway.app`)

## Step 2: Configure Stripe Webhooks

1. **Go to Stripe Dashboard**
   - Visit [dashboard.stripe.com](https://dashboard.stripe.com)
   - Navigate to "Developers" → "Webhooks"

2. **Add Endpoint**
   - Click "Add endpoint"
   - URL: `https://your-backend-url.up.railway.app/stripe-webhook`
   - Events: Select these 3 events:
     - `customer.subscription.created`
     - `customer.subscription.deleted`
     - `customer.subscription.updated`

3. **Update Webhook Secret**
   - Click on your new webhook
   - Copy the "Signing secret" (starts with `whsec_`)
   - Update Railway environment variables:
     - Go to project → Variables
     - Update `STRIPE_ENDPOINT_SECRET` with the new secret

## Step 3: Deploy Frontend to Netlify

### Update Frontend Configuration

1. **Update constants.json**
   - Edit `src/constants.json`
   - Change `backendURL` to your Railway backend URL:
   ```json
   {
     "backendURL": "https://yourapp.up.railway.app"
   }
   ```

### Create Netlify Site

1. **Create Netlify Account**
   - Go to [netlify.com](https://netlify.com)
   - Sign in with GitHub

2. **Deploy Frontend**
   - Click "New site from Git"
   - Connect your GitHub account
   - Select your skateboard repository

3. **Configure Build Settings**
   - **Branch to deploy:** `master`
   - **Root Directory:** Leave blank
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`

4. **Deploy Site**
   - Click "Deploy site"
   - Your frontend will be available at: `https://random-name.netlify.app`
   - You can customize the site name in site settings

## Step 4: Configure Custom Domain (Optional)

### On Netlify

1. **Add Custom Domain**
   - Go to Site settings → Domain management
   - Click "Add custom domain"
   - Enter your domain (e.g., `myapp.com`)

2. **Configure DNS**
   - Add CNAME record pointing to your Netlify subdomain
   - Or use Netlify DNS for full management

### Update CORS (if using custom domain)

1. **Update Backend CORS**
   - Add your custom domain to allowed origins in your backend
   - Redeploy Railway service if needed

## Step 5: Test Your Deployment

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

## Step 6: Go Live with Production Stripe

1. **Switch to Live Stripe Keys**
   - In Stripe dashboard, toggle from "Test mode" to "Live mode"
   - Copy your live secret key (starts with `sk_live_`)
   - Update Railway environment variables

2. **Update Webhook for Production**
   - Create a new webhook endpoint for live mode
   - Use the same Railway URL and events
   - Update `STRIPE_ENDPOINT_SECRET` with live webhook secret

3. **Redeploy Services**
   - Railway will auto-redeploy when you update environment variables
   - Netlify will auto-redeploy when you push to git

## Troubleshooting

**Netlify build fails?**
- Check that `package.json` has correct build script
- Verify build command is `npm run build`
- Check build logs for dependency issues

**Frontend can't connect to backend?**
- Verify `backendURL` in `constants.json` matches Railway URL
- Check Railway service is running and accessible
- Ensure CORS allows your Netlify domain

**Railway backend won't start?**
- Check environment variables are set correctly
- Verify workspace command includes `--workspace=backend`
- Review Railway deployment logs

**Stripe webhooks failing?**
- Verify webhook URL matches Railway backend URL
- Check webhook secret matches environment variable
- Ensure all 3 subscription events are selected

## Production Checklist

- [ ] Backend deployed on Railway
- [ ] Frontend deployed on Netlify
- [ ] Environment variables configured
- [ ] Database connected (if not using SQLite)
- [ ] Stripe webhooks configured with Railway URL
- [ ] Live Stripe keys configured
- [ ] Custom domain configured (optional)
- [ ] Test complete user flow
- [ ] Monitor service logs

## Platform Benefits

**Railway:**
- **Simple monorepo support** - Handles workspace setup automatically
- **Built-in databases** - Add PostgreSQL with one click
- **Auto-deploys** - Deploys on every git push
- **Great logs** - Easy debugging

**Netlify:**
- **Lightning fast** - Global CDN for frontend
- **Auto-deploys** - Deploys on git push
- **Branch previews** - Test changes before merging
- **Form handling** - Built-in contact forms
- **Custom domains** - Easy domain management

Your Skateboard app is now live with Railway + Netlify! 🚀