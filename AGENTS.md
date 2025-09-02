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

### Multi-Database Architecture
The application uses a database factory pattern supporting three database types:

**Database Providers** (`backend/database/`):
- `sqlite.js` - Default SQLite provider using Node.js built-in DatabaseSync
- `postgres.js` - PostgreSQL provider with connection pooling 
- `mongodb.js` - MongoDB provider with native driver
- `factory.js` - Unified interface and provider selection

**Configuration** (`backend/config.json`):
```json
[{
  "db": "MyApp",
  "origin": "http://localhost:5173", 
  "dbType": "sqlite|postgresql|mongodb",
  "connectionString": "./databases/MyApp.db"
}]
```

**Environment Variable Support:**
Connection strings support `${VAR_NAME}` syntax for production deployments:
```json
{
  "dbType": "mongodb",
  "connectionString": "${MONGODB_URL}"
}
```

Standard variables: `DATABASE_URL`, `MONGODB_URL`, `POSTGRES_URL`

**Database Operations:**
- Standard CRUD: `findUser()`, `insertUser()`, `updateUser()`, `findAuth()`, `insertAuth()`
- Generic queries: `databaseFactory.executeQuery(dbType, dbName, connectionString, queryObject)`

### Frontend Configuration System
**Constants-Driven UI** (`src/constants.json`):
- App branding, navigation, features, Stripe products
- Legal content with placeholder replacement (e.g., `_COMPANY_`, `_EMAIL_`)
- Dynamic generation of robots.txt, sitemap.xml, manifest.json via Vite plugins

**Context Management** (`src/context.jsx`):
- App-specific localStorage/cookie keys based on app name
- User state management with reducer pattern
- Automatic session persistence

### Authentication & Multi-Tenancy
**Origin-Based Isolation:**
- Database selection by request origin header
- JWT tokens include database configuration
- App-specific auth storage keys prevent cross-contamination

**Security Features:**
- Bcrypt with 14 salt rounds
- JWT with proper expiration handling
- CORS validation and origin checking
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
await databaseFactory.executeQuery('sqlite', 'MyApp', './db.db', {
  query: "SELECT * FROM users WHERE created_at > ?",
  params: [startDate]
});

// MongoDB
await databaseFactory.executeQuery('mongodb', 'MyApp', 'mongodb://localhost:27017', {
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
- `MONGODB_URL`, `POSTGRES_URL`, `DATABASE_URL` - Database connections (production)

### App Customization Workflow
1. Update `src/constants.json` for branding and features
2. Modify `backend/config.json` for database configuration  
3. Set environment variables in `backend/.env` for production databases
4. Run `npm run start` - Vite plugins auto-generate SEO assets
5. Legal content uses placeholder replacement system

## Database Migration Notes
When switching database types, ensure proper schema translation:
- SQLite uses TEXT primary keys, PostgreSQL/MongoDB may differ
- Subscription fields are flattened in SQL but nested in MongoDB
- Connection string format varies by database type
- Use environment variables (`${MONGODB_URL}`) for production deployments