# Production Configuration

For production deployments, override the default config using environment variables:

## Environment Variables

```bash
# Database (overrides config.json database settings)
DATABASE_URL=postgresql://user:pass@host:5432/prod_db
# or
DATABASE_URL=mongodb+srv://user:pass@cluster.mongodb.net/prod_db

# Application
NODE_ENV=production
CLIENT_URL=https://yourapp.com

# Required for all environments
STRIPE_KEY=sk_live_your_stripe_key
STRIPE_ENDPOINT_SECRET=whsec_your_webhook_secret
JWT_SECRET=your_secure_jwt_secret
```

## Example Production Setup

1. Set environment variables in your hosting platform
2. The server will automatically use PostgreSQL/MongoDB instead of SQLite
3. Client URL will be used for CORS and Stripe redirects

## Development vs Production

- **Development**: Uses SQLite with local config
- **Production**: Uses environment variables to override database and client settings