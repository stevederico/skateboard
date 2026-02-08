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

## Code Standards

### Documentation Requirements

**CRITICAL: Documentation must always match code.**

When making ANY code changes, you MUST update:
- JSDoc comments on modified functions/classes/components
- Inline comments explaining complex logic
- README.md if user-facing behavior changes
- CLAUDE.md if architecture/patterns change
- API docs if endpoints change
- CHANGELOG.md for all changes (see commit protocol)

**Before committing:**
1. Review all modified functions - do JSDoc comments match current implementation?
2. Check inline comments - do they explain current logic accurately?
3. Verify examples in docs still work with changes
4. Update version references if applicable

**Example - Function Signature Change:**
```javascript
// WRONG: Changed function but not JSDoc
/**
 * @param {string} email - User email
 */
async function updateUser(userId, email) { ... }

// CORRECT: Updated both code and JSDoc
/**
 * @param {string} userId - User ID
 * @param {string} email - User email
 */
async function updateUser(userId, email) { ... }
```

**Out-of-date documentation is worse than no documentation** - it misleads developers and wastes debugging time. Always keep docs in sync with code.

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

## UI Components — shadcn Primitives

**Always use the shadcn primitives from `@stevederico/skateboard-ui/shadcn/ui` when building views.** The goal is the standard shadcn design look and feel — clean, consistent, and composable.

**Import path:** `@stevederico/skateboard-ui/shadcn/ui/<component>`

**Available components:**
`accordion`, `alert`, `alert-dialog`, `aspect-ratio`, `avatar`, `badge`, `breadcrumb`, `button`, `button-group`, `calendar`, `card`, `carousel`, `chart`, `checkbox`, `collapsible`, `command`, `context-menu`, `dialog`, `drawer`, `dropdown-menu`, `empty`, `field`, `hover-card`, `input`, `input-group`, `item`, `kbd`, `label`, `menubar`, `navigation-menu`, `pagination`, `popover`, `progress`, `radio-group`, `resizable`, `scroll-area`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `slider`, `sonner`, `spinner`, `switch`, `table`, `tabs`, `textarea`, `toggle`, `toggle-group`, `tooltip`

**Rules:**
- Prefer shadcn components over custom HTML elements (e.g., use `<Button>` not `<button>`, `<Card>` not `<div className="card">`)
- Compose views from these primitives — don't reinvent patterns they already solve
- Check available components before building custom UI; if shadcn has it, use it
- Combine with Tailwind utility classes for layout and spacing

**Example:**
```javascript
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@stevederico/skateboard-ui/shadcn/ui/card';
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';
import { Label } from '@stevederico/skateboard-ui/shadcn/ui/label';
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
- skateboard@2.6.0
- skateboard-ui@2.9.3

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

make sure you read the readme in the @stevederico/skateboard-ui package
