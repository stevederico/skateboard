# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## Development Commands

**Primary Development:**
```bash
npm run start          # Start both frontend and backend concurrently
npm run front          # Frontend only (Vite dev server on :5173)
npm run server         # Backend only (Express server on :8000)
```

**Build Commands:**
```bash
npm run build          # Development build
npm run prod           # Production build
npm install-all        # Install all dependencies (root + workspace)
```

**Backend Commands:**
```bash
npm run --workspace=backend start    # Backend with --watch and experimental SQLite
```

## Architecture Overview

### Monorepo Structure
- **Root**: React frontend with Vite 7.1+ build system
- **Backend Workspace**: Express server with multi-database support

### Project Structure
```
skateboard/
├── src/
│   ├── components/       # Your custom components
│   ├── assets/          # Images, styles
│   ├── context.jsx      # Global state management
│   ├── main.jsx         # App entry point
│   └── constants.json   # All your app config
├── backend/
│   ├── server.js        # Express server
│   ├── adapters/        # Database adapters (SQLite, PostgreSQL, MongoDB)
│   ├── databases/       # SQLite database files
│   └── config.json      # Backend config with database settings
├── package.json         # Dependencies
└── vite.config.js       # Vite configuration
```

### Multi-Database Architecture
The application uses a database factory pattern supporting three database types:

**Database Adapters** (`backend/adapters/`):
- `sqlite.js` - Default SQLite provider using Node.js built-in DatabaseSync
- `postgres.js` - PostgreSQL provider with connection pooling 
- `mongodb.js` - MongoDB provider with native driver
- `manager.js` - Unified interface and provider selection

**Configuration** (`backend/config.json`):
```json
{
  "client": "http://localhost:5173",
  "database": {
    "db": "MyApp",
    "dbType": "sqlite",
    "connectionString": "./databases/MyApp.db"
  }
}
```

**Configuration Structure:**
- **`client`** - Frontend origin allowed for CORS requests
- **`database`** - Single database configuration
  - **`db`** - Database name
  - **`dbType`** - Database type: `sqlite`, `postgresql`, or `mongodb`
  - **`connectionString`** - Connection path/URL (supports `${VAR_NAME}` for env variables)

**Environment Variable Support:**
Connection strings support `${VAR_NAME}` syntax for production deployments.
Standard variables: `DATABASE_URL`, `MONGODB_URL`, `POSTGRES_URL`

**Database Operations:**
- Standard CRUD: `findUser()`, `insertUser()`, `updateUser()`, `findAuth()`, `insertAuth()`
- Generic queries: `databaseManager.executeQuery(dbType, dbName, connectionString, queryObject)`

### Frontend Configuration System
**Constants-Driven UI** (`src/constants.json`):
- App branding, navigation, features, Stripe products
- Legal content with placeholder replacement (e.g., `_COMPANY_`, `_EMAIL_`)
- Dynamic generation of robots.txt, sitemap.xml, manifest.json via Vite plugins

**Context Management** (`src/context.jsx`):
- App-specific localStorage/cookie keys based on app name
- User state management with reducer pattern
- Automatic session persistence

### Authentication & Security
**Authentication System:**
- JWT tokens in HttpOnly cookies
- CSRF token protection for state-changing operations
- App-specific auth storage keys based on app name from constants.json

**Security Features:**
- Bcrypt password hashing with 10 salt rounds
- JWT with 30-day expiration
- CSRF token store with 24-hour expiry
- Rate limiting (10 req/15min for auth, 300 req/15min global)
- CORS validation and origin checking
- Security headers (CSP, HSTS, X-Frame-Options, etc.)
- Graceful shutdown handling for containers

### Build System Integration
**Vite Configuration:**
- Dynamic content replacement in HTML from constants.json
- SEO assets generation (robots, sitemap, manifest) 
- Custom logging and HMR configuration
- Optimized production builds with console removal

## Key Implementation Patterns

### Database Query Examples
```javascript
// SQL databases
await databaseManager.executeQuery('sqlite', 'MyApp', './db.db', {
  query: "SELECT * FROM users WHERE created_at > ?",
  params: [startDate]
});

// MongoDB
await databaseManager.executeQuery('mongodb', 'MyApp', 'mongodb://localhost:27017', {
  collection: 'users',
  operation: 'aggregate',
  pipeline: [{ $match: { status: 'active' } }]
});
```

### Environment Setup
Backend requires `.env` file with:
- `JWT_SECRET` - Token signing key
- `STRIPE_KEY` - Payment processing
- `STRIPE_ENDPOINT_SECRET` - Webhook verification
- `FREE_USAGE_LIMIT` - Usage limit for free users (default: 20)
- `MONGODB_URL`, `POSTGRES_URL`, `DATABASE_URL` - Database connections (production)

### App Customization Workflow
1. Update `src/constants.json` for branding and features
2. Modify `backend/config.json` for client origin and database settings
3. Set environment variables in `backend/.env`:
   - `JWT_SECRET` - Required for authentication
   - `STRIPE_KEY` - Required for payments
   - `STRIPE_ENDPOINT_SECRET` - Required for webhooks
   - `FREE_USAGE_LIMIT` - Optional, sets monthly usage limit for free users (default: 20)
   - Database URLs (if using environment variables in connectionString)
4. Run `npm run start` - Vite plugins auto-generate SEO assets
5. Legal content uses placeholder replacement system (`_COMPANY_`, `_EMAIL_`, `_WEBSITE_`)

### Usage Tracking System
**Backend Endpoints:**
- `POST /usage` - Unified endpoint for usage tracking and checking
  - `operation: "check"` - Get current usage stats
  - `operation: "track"` - Increment usage and get updated stats
  - Returns: `{ remaining, total, isSubscriber, used, subscription }`

**Database Schema (SQLite/PostgreSQL):**
- `usage_count` - Total actions taken in current period (flat field)
- `usage_reset_at` - Timestamp when usage resets (flat field)

**API Response Format:**
- Nested object: `usage: { count: 5, reset_at: 1733097600 }`
- Database adapters transform flat fields to nested object

**Frontend Integration:**
- `getRemainingUsage()` - Calls `POST /usage` with `operation: "check"`
- `trackUsage()` - Calls `POST /usage` with `operation: "track"`, returns updated usage data
- Components maintain `usageInfo` state from endpoint responses
- Subscribers automatically get unlimited usage

## Database Migration Notes
When switching database types, ensure proper schema translation:
- SQLite uses TEXT primary keys, PostgreSQL/MongoDB may differ
- Subscription fields are flattened in SQL (`subscription_stripeID`, `subscription_expires`, `subscription_status`) but nested in MongoDB
- Usage fields are flattened in SQL (`usage_count`, `usage_reset_at`) but nested in MongoDB
- Connection string format varies by database type
- Use environment variables (`${MONGODB_URL}`) for production deployments