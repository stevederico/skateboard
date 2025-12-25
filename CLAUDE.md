# CLAUDE.md

Project guidance for Claude Code and AI agents working with this repository.

## Development Commands

**Primary Development:**
```bash
npm run start          # Start both frontend and backend concurrently
npm run front          # Frontend only (Vite dev server on :5173)
npm run server         # Backend only (Hono server on :8000)
```

**Build Commands:**
```bash
npm run build          # Development build
npm run prod           # Production build
npm install-all        # Install all dependencies (root + workspace)
```

## Architecture Overview

### Application Shell Architecture (v1.1)

Skateboard uses an **Application Shell Architecture** where skateboard-ui provides the framework (shell) and your app provides the content. This eliminates 95% of boilerplate.

**Three-part architecture:**
1. **Shell** (skateboard-ui package) - Routing, context, auth, utilities, components
2. **Content** (your code) - Custom components and business logic
3. **Config** (constants.json) - App-specific configuration

**Key principle:** Update skateboard-ui package once, all apps inherit improvements.

### Monorepo Structure
- **Root**: React frontend with Vite 7.1+ build system using skateboard-ui
- **Backend Workspace**: Hono server with multi-database support

### Project Structure
```
skateboard/
├── src/
│   ├── components/       # Your custom components (e.g., HomeView.jsx)
│   ├── assets/
│   │   └── styles.css   # Brand color override (7 lines)
│   ├── main.jsx         # Route definitions (16 lines)
│   └── constants.json   # All your app config
├── backend/
│   ├── server.js        # Hono server
│   ├── adapters/        # Database adapters (SQLite, PostgreSQL, MongoDB)
│   ├── databases/       # SQLite database files
│   └── config.json      # Backend config with database settings
├── package.json         # Dependencies (includes skateboard-ui)
└── vite.config.js       # Vite configuration (app-owned)
```

**What's NOT in your app (provided by skateboard-ui):**
- `context.jsx` - Imported from skateboard-ui/Context
- Complex routing setup - Uses createSkateboardApp()
- Full theme CSS - Imports base theme from skateboard-ui

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

### Authentication & Security
- JWT tokens in HttpOnly cookies
- CSRF token protection for state-changing operations
- Bcrypt password hashing with 10 salt rounds
- JWT with 30-day expiration
- Rate limiting (10 req/15min for auth, 5 req/15min for payments, 300 req/15min global)
- Security headers (CSP, HSTS, X-Frame-Options, etc.)

### Build System Integration

**Vite Configuration** (v1.1+ app-owned):
Apps own their `vite.config.js` directly. See [reference implementation](https://github.com/stevederico/skateboard/blob/master/vite.config.js).

**Styling:**
```css
/* src/assets/styles.css */
@import "@stevederico/skateboard-ui/styles.css";

@source '../../node_modules/@stevederico/skateboard-ui';

@theme {
  --color-app: var(--color-purple-500);
}
```

## Key Implementation Patterns

### API Requests

```javascript
import { apiRequest } from '@stevederico/skateboard-ui/Utilities';

// GET request
const deals = await apiRequest('/deals');

// POST with body
const newDeal = await apiRequest('/deals', {
  method: 'POST',
  body: JSON.stringify({ name: 'New Deal', amount: 5000 })
});
```

**Features:**
- Auto-includes credentials
- Auto-adds CSRF token for mutations
- Auto-redirects to /signout on 401
- 30-second timeout

### Data Fetching with Hooks

```javascript
import { useListData } from '@stevederico/skateboard-ui/Utilities';

function DealsView() {
  const { data, loading, error, refetch } = useListData('/deals');

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return data.map(deal => <DealCard key={deal.id} {...deal} />);
}
```

### Context Usage

```javascript
import { getState } from '@stevederico/skateboard-ui/Context';

function MyComponent() {
  const { state, dispatch } = getState();
  const user = state.user;

  // Update user
  dispatch({ type: 'SET_USER', payload: newUserData });

  // Clear user (sign out)
  dispatch({ type: 'CLEAR_USER' });
}
```

### Environment Setup
Backend requires `.env` file with:
- `JWT_SECRET` - Token signing key (required)
- `STRIPE_KEY` - Payment processing (required)
- `STRIPE_ENDPOINT_SECRET` - Webhook verification (required)
- `CORS_ORIGINS` - Comma-separated allowed origins (production)
- `FRONTEND_URL` - Frontend URL for Stripe redirects (production)
- `FREE_USAGE_LIMIT` - Usage limit for free users (default: 20)
- `MONGODB_URL`, `POSTGRES_URL`, `DATABASE_URL` - Database connections (production)

## Documentation

**Reference:**
- [Architecture](docs/ARCHITECTURE.md) - Application Shell pattern, production config
- [Migration](docs/MIGRATION.md) - Upgrade between versions
- [Deployment](docs/DEPLOY.md) - Vercel, Render, Netlify, Docker
- [API Reference](docs/API.md) - REST endpoint documentation
- [Schema](docs/SCHEMA.md) - Database schema reference

**Version:**
- skateboard@1.1.4
- skateboard-ui@1.2.12

## Updating from Skateboard Boilerplate

This project was created from the skateboard boilerplate. The `skateboardVersion` field in package.json indicates which version was used.

**Reference repo:** https://github.com/stevederico/skateboard

### Update Workflow

1. Check `skateboardVersion` in package.json against latest release
2. Review CHANGELOG.md in the reference repo for changes
3. Update skateboard-ui: `npm install @stevederico/skateboard-ui@latest`
4. Compare and update boilerplate files
5. Update `skateboardVersion` field after applying changes

### Safe to Update (review and apply)
- `backend/server.js` - Server logic, security updates
- `backend/adapters/*` - Database adapters
- `vite.config.js` - Build configuration
- `src/assets/styles.css` - Theme variables (merge carefully)

### Never Auto-Update (app-specific)
- `constants.json` - App configuration
- `src/components/*` - Custom components
- `backend/config.json` - Database/environment config

### Important
Do NOT automatically apply boilerplate updates. Always consult the user first and show what changes would be made.
