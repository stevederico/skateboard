# Production Configuration

For production deployments, override the default config using environment variables:

## Environment Variables

```bash
# Database (overrides config.json database settings)
DATABASE_URL=postgresql://user:pass@host:5432/prod_db
# or
MONGODB_URL=mongodb+srv://user:pass@cluster.mongodb.net/prod_db

# CORS - Comma-separated list of allowed origins
CORS_ORIGINS=https://yourapp.com,https://www.yourapp.com

# Frontend URL - Used for Stripe redirects (success/cancel URLs)
FRONTEND_URL=https://yourapp.com

# Application
NODE_ENV=production
PORT=8000

# Required for all environments
STRIPE_KEY=sk_live_your_stripe_key
STRIPE_ENDPOINT_SECRET=whsec_your_webhook_secret
JWT_SECRET=your_secure_jwt_secret

# Usage limits (optional)
FREE_USAGE_LIMIT=20
```

## Example Production Setup

1. Set environment variables in your hosting platform
2. The server will automatically use PostgreSQL/MongoDB instead of SQLite
3. CORS_ORIGINS controls which domains can make API requests
4. FRONTEND_URL is used for Stripe checkout success/cancel redirects

## Development vs Production

- **Development**: Uses SQLite with local config, localhost CORS
- **Production**: Uses environment variables to override database, CORS, and redirect settings

## Docker Deployment

The included Dockerfile uses Deno runtime:

```bash
docker build -t skateboard .
docker run -p 8000:8000 --env-file .env skateboard
```

The multi-stage build produces a minimal production image with only the compiled frontend and backend.