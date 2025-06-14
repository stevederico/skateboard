# Deployment

Deploy your Skateboard application to production with these deployment guides.

## Quick Deploy Options

### Vercel (Recommended for Frontend)

1. **Connect Repository**
   ```bash
   npm install -g vercel
   vercel
   ```

2. **Configure Build Settings**
   - Build Command: `npm run prod`
   - Output Directory: `dist`
   - Install Command: `npm install`

3. **Environment Variables**
   Add in Vercel dashboard:
   ```
   VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
   VITE_API_URL=https://your-backend.com
   ```

### Railway (Recommended for Backend)

1. **Deploy Backend**
   ```bash
   npm install -g @railway/cli
   railway login
   railway init
   railway up
   ```

2. **Environment Variables**
   ```bash
   railway add STRIPE_SECRET_KEY=sk_live_...
   railway add MONGODB_URL=mongodb://...
   railway add JWT_SECRET=your-secret
   ```

### Netlify

1. **Deploy**
   ```bash
   npm install -g netlify-cli
   netlify init
   netlify deploy --prod
   ```

2. **Build Settings**
   - Build command: `npm run prod`
   - Publish directory: `dist`

## Production Checklist

### Frontend

- [ ] Update `VITE_API_URL` to production backend
- [ ] Use production Stripe publishable key
- [ ] Enable HTTPS
- [ ] Configure custom domain
- [ ] Set up analytics (Google Analytics, etc.)
- [ ] Test all routes and features
- [ ] Optimize images and assets
- [ ] Enable gzip compression

### Backend

- [ ] Use production MongoDB database
- [ ] Use production Stripe secret key
- [ ] Set secure JWT secret
- [ ] Configure CORS for production domain
- [ ] Enable HTTPS/SSL
- [ ] Set up environment variables
- [ ] Configure rate limiting
- [ ] Set up logging and monitoring
- [ ] Test webhook endpoints
- [ ] Configure backups

## Detailed Deployment Guides

### Vercel Deployment

#### 1. Prepare for Deployment

```bash
# Build for production
npm run prod

# Test production build locally
npm install -g serve
serve -s dist
```

#### 2. Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Follow prompts:
# ? Set up and deploy? Yes
# ? Which scope? Your username
# ? Link to existing project? No
# ? What's your project's name? my-skateboard-app
# ? In which directory is your code located? ./
```

#### 3. Configure Environment Variables

In Vercel dashboard:
```
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
VITE_API_URL=https://your-backend-url.com
```

#### 4. Custom Domain

1. Go to Vercel dashboard → Domains
2. Add your custom domain
3. Configure DNS records as shown

### Railway Backend Deployment

#### 1. Prepare Backend

```bash
cd backend

# Create Procfile
echo "web: node server.js" > Procfile

# Update package.json
{
  "scripts": {
    "start": "node server.js"
  }
}
```

#### 2. Deploy to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

#### 3. Environment Variables

```bash
railway add STRIPE_SECRET_KEY=sk_live_...
railway add STRIPE_WEBHOOK_SECRET=whsec_...
railway add MONGODB_URL=mongodb+srv://...
railway add JWT_SECRET=your-super-secret-key
railway add NODE_ENV=production
```

#### 4. Custom Domain

1. Railway dashboard → Settings → Domains
2. Add custom domain
3. Configure DNS

### MongoDB Atlas Setup

1. **Create Cluster**
   - Go to [MongoDB Atlas](https://cloud.mongodb.com)
   - Create new cluster
   - Choose cloud provider and region

2. **Configure Access**
   - Database Access → Add user
   - Network Access → Add IP address (0.0.0.0/0 for all IPs)

3. **Get Connection String**
   - Connect → Connect your application
   - Copy connection string
   - Replace `<password>` with your password

### DigitalOcean App Platform

#### 1. Create App

```yaml
# .do/app.yaml
name: skateboard-app
services:
- name: frontend
  source_dir: /
  github:
    repo: your-username/your-repo
    branch: main
  build_command: npm run prod
  output_dir: dist
  http_port: 8080
  instance_count: 1
  instance_size_slug: basic-xxs
  routes:
  - path: /
  envs:
  - key: VITE_STRIPE_PUBLISHABLE_KEY
    value: pk_live_...
  - key: VITE_API_URL
    value: https://your-backend-url.com

- name: backend
  source_dir: /backend
  build_command: npm install
  run_command: node server.js
  http_port: 3001
  instance_count: 1
  instance_size_slug: basic-xxs
  routes:
  - path: /api
  envs:
  - key: STRIPE_SECRET_KEY
    value: sk_live_...
  - key: MONGODB_URL
    value: mongodb+srv://...
```

#### 2. Deploy

```bash
doctl apps create --spec .do/app.yaml
```

## Environment Configuration

### Production Environment Variables

#### Frontend (.env.production)
```
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
VITE_API_URL=https://api.yourapp.com
VITE_ENVIRONMENT=production
```

#### Backend (.env)
```
NODE_ENV=production
PORT=3001
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
MONGODB_URL=mongodb+srv://...
JWT_SECRET=your-super-secret-key
CORS_ORIGIN=https://yourapp.com
```

## SSL/HTTPS Setup

### Cloudflare (Recommended)

1. Add your domain to Cloudflare
2. Update nameservers
3. Enable "Full (strict)" SSL mode
4. Turn on "Always Use HTTPS"

### Let's Encrypt (Self-managed)

```bash
# Install certbot
sudo apt-get install certbot

# Get certificate
sudo certbot certonly --standalone -d yourdomain.com

# Configure nginx/apache with certificate
```

## Performance Optimization

### Frontend Optimization

```javascript
// vite.config.js
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          ui: ['@stevederico/skateboard-ui']
        }
      }
    }
  }
}
```

### Backend Optimization

```javascript
// Add compression
app.use(compression());

// Add rate limiting
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

## Monitoring & Analytics

### Error Tracking

```bash
# Add Sentry
npm install @sentry/react @sentry/node
```

```javascript
// Frontend - main.jsx
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "YOUR_SENTRY_DSN",
});
```

### Analytics

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

## Troubleshooting

### Common Issues

**Build Failures:**
- Check all environment variables are set
- Verify all dependencies are installed
- Check for syntax errors

**CORS Errors:**
- Update backend CORS configuration
- Verify frontend URL in backend config

**Database Connection:**
- Check MongoDB connection string
- Verify network access settings
- Test connection locally first

**Stripe Webhooks:**
- Verify webhook URL is accessible
- Check webhook secret configuration
- Test with Stripe CLI
