# Skateboard Skill

**The complete guide for building apps with Skateboard (boilerplate) and skateboard-ui (component library).**

## The Four Commandments

1. **Use skateboard-ui shadcn primitives** — never raw HTML when a component exists
2. **Use semantic design tokens** — never raw colors, hardcoded radii, or magic numbers
3. **Compose from patterns** — Cards, Dialogs, Forms have defined structures; follow them
4. **Validate accessibility** — every interactive element needs a label, keyboard support, and contrast

## Architecture

Skateboard uses an **Application Shell Architecture** with three parts:

1. **Shell** (`@stevederico/skateboard-ui`) — routing, context, auth, utilities, 50+ components
2. **Content** (your code) — custom views and business logic
3. **Config** (`constants.json`) — app-specific configuration

Update skateboard-ui once, all apps inherit improvements.

## Scaffolding

```bash
npx create-skateboard-app@latest my-app --yes
cd my-app
npm run install-all
npm run start
```

Frontend: http://localhost:5173 — Backend: http://localhost:8000

## Project Structure

```
my-app/
├── src/
│   ├── components/       # Your custom views (HomeView.jsx, etc.)
│   ├── assets/
│   │   └── styles.css   # Brand color override (~7 lines)
│   ├── main.jsx         # Route definitions (~16 lines)
│   └── constants.json   # All app config
├── backend/
│   ├── server.js        # Hono server with auth, payments, CRUD
│   ├── adapters/        # Database adapters (SQLite, PostgreSQL, MongoDB)
│   ├── databases/       # SQLite database files
│   └── config.json      # Backend database config
├── vite.config.js       # App-owned Vite configuration
└── package.json
```

## Entry Point — main.jsx

```jsx
import './assets/styles.css';
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import Layout from '@stevederico/skateboard-ui/Layout';
import constants from './constants.json';
import HomeView from './components/HomeView.jsx';

const appRoutes = [
  { path: 'home', element: <HomeView /> }
];

createSkateboardApp({
  constants,
  appRoutes,
  defaultRoute: 'home',
  overrides: { layout: Layout }
});
```

**Rules:**
- Routes are relative paths (no leading slash)
- `defaultRoute` is the initial authenticated route
- Use `overrides.layout` to wrap Layout with global components (e.g. CommandMenu)
- Lazy-load heavy views with `React.lazy()` and `<Suspense>`

## constants.json

The single config file for the entire app:

| Key | Purpose |
|-----|---------|
| `appName` | App display name |
| `appIcon` | Lucide icon name for sidebar |
| `tagline` | Landing page tagline |
| `noLogin` | `true` to skip auth entirely |
| `authOverlay` | `true` for modal auth, `false` for redirect |
| `sidebarCollapsed` | Default sidebar state |
| `pages` | Sidebar navigation items (`title`, `url`, `icon`) |
| `backendURL` | Production API base (`/api`) |
| `devBackendURL` | Dev API base (`http://localhost:8000/api`) |
| `features` | Landing page feature cards |
| `stripeProducts` | Pricing plans with `lookup_key` |
| `design` | Visual identity (see below) |

### Design Block

```json
"design": {
  "baseColor": "neutral",
  "radius": "medium",
  "font": "geist",
  "iconLibrary": "lucide"
}
```

Respect these values when building UI. Don't override the design system — extend within it.

## Styling — styles.css

```css
@import "@stevederico/skateboard-ui/styles.css";
@source '../../node_modules/@stevederico/skateboard-ui';

@theme {
  --color-app: var(--color-purple-500);
}
```

Change `--color-app` to set the brand/primary color. Everything else inherits from skateboard-ui.

## API Patterns

### apiRequest

```jsx
import { apiRequest } from '@stevederico/skateboard-ui/Utilities';

const data = await apiRequest('/endpoint');
const created = await apiRequest('/endpoint', {
  method: 'POST',
  body: JSON.stringify({ name: 'New Item' })
});
```

Auto-includes credentials, CSRF token, 30s timeout, 401 redirect.

### useListData

```jsx
import { useListData } from '@stevederico/skateboard-ui/Utilities';

const { data, loading, error, refetch } = useListData('/endpoint');
```

### Context

```jsx
import { getState } from '@stevederico/skateboard-ui/Context';

const { state, dispatch } = getState();
const user = state.user;
dispatch({ type: 'SET_USER', payload: newUser });
```

## Backend — Hono + SQLite

### config.json

```json
{
  "staticDir": "../dist",
  "database": {
    "db": "MyApp",
    "dbType": "sqlite",
    "connectionString": "./databases/MyApp.db"
  }
}
```

Supports `sqlite`, `postgresql`, and `mongodb` via the adapter pattern in `backend/adapters/`.

### Database Manager

```jsx
import { databaseManager } from './adapters/manager.js';

await databaseManager.findUser(dbType, dbName, connString, { email });
await databaseManager.insertUser(dbType, dbName, connString, userData);
await databaseManager.updateUser(dbType, dbName, connString, query, update);
```

### Built-in Backend Features

- JWT auth with HttpOnly cookies (30-day expiry)
- CSRF token protection
- Bcrypt password hashing (10 salt rounds)
- Stripe webhook handlers (checkout, invoice.paid, payment_failed)
- Rate limiting (auth, payments, global)
- Security headers (CSP, HSTS, X-Frame-Options)
- Structured logging
- Graceful shutdown

### Environment Variables

```
JWT_SECRET=              # Required — token signing
STRIPE_KEY=              # Required — Stripe secret key
STRIPE_ENDPOINT_SECRET=  # Required — webhook verification
CORS_ORIGINS=            # Production — comma-separated origins
FRONTEND_URL=            # Production — for Stripe redirects
```

## Component Selection Table

| Need | Use | Not |
|------|-----|-----|
| Action trigger | `<Button>` | `<button>`, `<a onClick>` |
| Text input | `<Input>` + `<Label>` | `<input>` |
| Long text input | `<Textarea>` + `<Label>` | `<textarea>` |
| Single select | `<Select>` | `<select>`, custom dropdown |
| Multi-option toggle | `<ToggleGroup>` | Radio buttons, checkboxes |
| Boolean toggle | `<Switch>` + `<Label>` | `<input type="checkbox">` |
| Content container | `<Card>` | `<div className="card">` |
| Modal content | `<Dialog>` | `<div className="modal">` |
| Side panel | `<Sheet>` | absolute-positioned div |
| Bottom panel (mobile) | `<Drawer>` | fixed-bottom div |
| Navigation | `<NavigationMenu>` | `<nav>` with custom links |
| Tabbed content | `<Tabs>` | Manual tab implementation |
| Data display | `<Table>` | `<table>` |
| Loading state | `<Spinner>` or `<Skeleton>` | Custom spinner div |
| Empty state | `<Empty>` | Conditional text |
| Toast notification | `toast()` from sonner | `alert()`, custom toast |
| Dropdown actions | `<DropdownMenu>` | Custom popover |
| Confirmation | `<AlertDialog>` | `confirm()`, `window.confirm` |
| Form field group | `<Field>` | Manual label+input+error div |
| Keyboard shortcut | `<Kbd>` | `<code>` or `<span>` |
| Progress indicator | `<Progress>` | Custom progress bar |
| Grouped buttons | `<ButtonGroup>` | Adjacent buttons |
| List item | `<Item>` | `<li>` or custom div |

**Import path:** `@stevederico/skateboard-ui/shadcn/ui/<component>`

## Header Component

```jsx
import Header from '@stevederico/skateboard-ui/Header';

<Header title="Projects">
  <Button size="sm"><Plus size={18} /> New Project</Button>
</Header>

// Simple text button shorthand
<Header title="Settings" buttonTitle="Save" onButtonTitleClick={handleSave} />
```

## Rules Index

- **[Styling](rules/styling.md)** — Color tokens, spacing, semantic classes
- **[Composition](rules/composition.md)** — Component nesting, Card/Dialog/Form patterns
- **[Forms](rules/forms.md)** — Label+Input pairing, validation, option groups
- **[Icons](rules/icons.md)** — Lucide icons, sizing, accessibility
- **[Guidelines](rules/guidelines.md)** — Top 40 web interface guidelines
- **[Views](rules/views.md)** — Page layout, headers, data fetching patterns
