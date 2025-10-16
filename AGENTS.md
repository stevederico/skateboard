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

### Application Shell Architecture (v1.0)

Skateboard uses an **Application Shell Architecture** where skateboard-ui provides the framework (shell) and your app provides the content. This eliminates 95% of boilerplate.

**Three-part architecture:**
1. **Shell** (skateboard-ui package) - Routing, context, auth, utilities, components
2. **Content** (your code) - Custom components and business logic
3. **Config** (constants.json) - App-specific configuration

**Key principle:** Update skateboard-ui package once, all apps inherit improvements.

### Monorepo Structure
- **Root**: React frontend with Vite 7.1+ build system using skateboard-ui@1.0+
- **Backend Workspace**: Express server with multi-database support

### Project Structure (v1.0)
```
skateboard/
├── src/
│   ├── components/       # Your custom components (e.g., HomeView.jsx)
│   ├── assets/
│   │   └── styles.css   # Brand color override (7 lines)
│   ├── main.jsx         # Route definitions (16 lines)
│   └── constants.json   # All your app config
├── backend/
│   ├── server.js        # Express server
│   ├── adapters/        # Database adapters (SQLite, PostgreSQL, MongoDB)
│   ├── databases/       # SQLite database files
│   └── config.json      # Backend config with database settings
├── package.json         # Dependencies (includes skateboard-ui@1.0+)
└── vite.config.js       # Vite configuration (3 lines using utility)
```

**What's NOT in your app anymore (provided by skateboard-ui):**
- ❌ `context.jsx` - Imported from skateboard-ui/Context
- ❌ Complex routing setup - Uses createSkateboardApp()
- ❌ Full theme CSS - Imports base theme from skateboard-ui
- ❌ Vite plugin definitions - Uses getSkateboardViteConfig()

**Result:** ~550 lines of boilerplate → ~26 lines

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

**skateboard-ui@1.0 Exports:**
- `Context` - ContextProvider and getState (user state management)
- `App` - createSkateboardApp() function (complete routing shell)
- `Utilities` - apiRequest, hooks (useListData, useForm), Vite config
- `Components` - Layout, Landing, SignIn, Settings, Payment, etc.
- `styles.css` - Complete base theme (182 lines)

**Constants-Driven UI** (`src/constants.json`):
- App branding, navigation, features, Stripe products
- Legal content with placeholder replacement (e.g., `_COMPANY_`, `_EMAIL_`)
- Dynamic generation of robots.txt, sitemap.xml, manifest.json via Vite plugins

**Context Management** (from skateboard-ui):
```javascript
import { ContextProvider, getState } from '@stevederico/skateboard-ui/Context';
```
- App-specific localStorage/cookie keys based on app name
- User state management with reducer pattern (SET_USER, CLEAR_USER)
- Automatic session persistence

**Main Entry Point** (`src/main.jsx`):
```javascript
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import constants from './constants.json';
import HomeView from './components/HomeView.jsx';

const appRoutes = [
  { path: 'home', element: <HomeView /> }
];

createSkateboardApp({ constants, appRoutes, defaultRoute: 'home' });
```
- Defines only custom routes
- Shell handles all infrastructure (routing, layout, auth, landing, settings, etc.)

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

**Vite Configuration** (v1.0 simplified):
```javascript
// vite.config.js
import { getSkateboardViteConfig } from '@stevederico/skateboard-ui/Utilities';

export default getSkateboardViteConfig();
```

**Includes automatically:**
- Dynamic content replacement in HTML from constants.json
- SEO assets generation (robots.txt, sitemap.xml, manifest.json)
- Custom logging and HMR configuration
- Optimized production builds with console removal
- All standard plugins and aliases

**Override if needed:**
```javascript
export default getSkateboardViteConfig({
  server: { port: 3000, proxy: { '/api': 'http://localhost:8080' } },
  plugins: [customPlugin()],
  build: { sourcemap: true }
});
```

**Styling** (v1.0 simplified):
```css
/* src/assets/styles.css */
@import "@stevederico/skateboard-ui/styles.css";

@source '../../node_modules/@stevederico/skateboard-ui';

@theme {
  --color-app: var(--color-purple-500);
}
```
- Import complete base theme (182 lines of CSS variables)
- Override only what you need
- All light/dark mode handled automatically

## Key Implementation Patterns (v1.0)

### API Requests

**Use apiRequest utility** (from skateboard-ui):
```javascript
import { apiRequest, apiRequestWithParams } from '@stevederico/skateboard-ui/Utilities';

// GET request
const deals = await apiRequest('/deals');

// POST with body
const newDeal = await apiRequest('/deals', {
  method: 'POST',
  body: JSON.stringify({ name: 'New Deal', amount: 5000 })
});

// GET with query parameters
const results = await apiRequestWithParams('/search', { query: 'test', page: 1 });
```

**Features:**
- Auto-includes credentials
- Auto-adds CSRF token for mutations
- Auto-redirects to /signout on 401
- JSON error handling

### Data Fetching with Hooks

**useListData hook** (from skateboard-ui):
```javascript
import { useListData } from '@stevederico/skateboard-ui/Utilities';

function DealsView() {
  const { data, loading, error, refetch } = useListData(
    '/deals',
    (a, b) => new Date(b.created) - new Date(a.created)  // optional sort
  );

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      {data.map(deal => <DealCard key={deal.id} {...deal} />)}
      <button onClick={refetch}>Refresh</button>
    </div>
  );
}
```

**useForm hook** (from skateboard-ui):
```javascript
import { useForm } from '@stevederico/skateboard-ui/Utilities';

function CreateDeal() {
  const { values, handleChange, handleSubmit, submitting, error } = useForm(
    { name: '', amount: 0 },
    async (values) => {
      await apiRequest('/deals', {
        method: 'POST',
        body: JSON.stringify(values)
      });
    }
  );

  return (
    <form onSubmit={handleSubmit}>
      <input value={values.name} onChange={handleChange('name')} />
      <input value={values.amount} onChange={handleChange('amount')} type="number" />
      <button disabled={submitting}>Create Deal</button>
      {error && <div className="error">{error}</div>}
    </form>
  );
}
```

### Context Usage

**Access user state** (from skateboard-ui):
```javascript
import { getState } from '@stevederico/skateboard-ui/Context';

function MyComponent() {
  const { state, dispatch } = getState();

  // Access user
  const user = state.user;

  // Update user
  dispatch({ type: 'SET_USER', payload: newUserData });

  // Clear user (sign out)
  dispatch({ type: 'CLEAR_USER' });
}
```

## Legacy Patterns (Pre-1.0)

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

### App Customization Workflow (v1.0)

**Initial Setup:**
1. Install dependencies: `npm install`
2. Update `src/constants.json` for branding, features, navigation
3. Configure `backend/config.json` for database and CORS
4. Set environment variables in `backend/.env`:
   - `JWT_SECRET` - Required for authentication
   - `STRIPE_KEY` - Required for payments
   - `STRIPE_ENDPOINT_SECRET` - Required for webhooks
   - `FREE_USAGE_LIMIT` - Optional, monthly limit for free users (default: 20)
   - Database URLs (if using environment variables)
5. Run `npm run start` - Vite auto-generates SEO assets

**Add New Routes:**
1. Create component in `src/components/` (e.g., `DashboardView.jsx`)
2. Add to `src/main.jsx`:
```javascript
const appRoutes = [
  { path: 'home', element: <HomeView /> },
  { path: 'dashboard', element: <DashboardView /> }  // ← Add this
];
```
3. That's it! Shell handles routing infrastructure

**Customize Styles:**
```css
/* src/assets/styles.css */
@import "@stevederico/skateboard-ui/styles.css";

@theme {
  --color-app: var(--color-green-500);  /* Change brand color */
  --radius: 0.5rem;                      /* Override radius */
}
```

**Update skateboard-ui Package:**
```bash
npm install @stevederico/skateboard-ui@latest
npm install
```
All apps automatically inherit improvements!

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

## Documentation

**Architecture & Migration:**
- [Architecture Documentation](docs/ARCHITECTURE.md) - Deep dive into Application Shell Architecture
- [Migration Guide 1.0.0](docs/MIGRATION_GUIDE.md) - Upgrade from 0.9.x to 1.0.0
- [Migration Guide 0.9.8](docs/MIGRATION_GUIDE-OLD-0.9.8.md) - Legacy migration guide

**Key Concepts:**
- **Application Shell** - Framework provides structure, app provides content
- **Convention over Configuration** - Sensible defaults with escape hatches
- **Update Once, Fix Everywhere** - Central package updates propagate to all apps
- **95% Boilerplate Reduction** - Focus on features, not infrastructure

**Version:**
- skateboard@1.0.0
- skateboard-ui@1.0.0