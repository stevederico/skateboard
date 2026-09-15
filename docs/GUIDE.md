# Skateboard Guide

Complete reference for the Skateboard boilerplate. Quick links:

- [Architecture](#architecture) — Application Shell pattern, structure, scaling
- [API Reference](#api-reference) — REST endpoints
- [Database Schema](#database-schema) — SQLite tables and fields
- [Deployment](#deployment) — Vercel, Render, Netlify, Docker
- [Migration](#migration) — Upgrade prompt for AI agents

---

## Architecture


### Overview

Skateboard uses an **Application Shell Architecture** (also known as **Inversion of Control** or **Template Method Pattern**), where the framework (skateboard-ui) provides the structure, and your app provides the content.

**Philosophy**: "Convention over configuration with escape hatches everywhere"

### Core Concept

#### Traditional React App Architecture

```
┌─────────────────────────────────────┐
│         Your Application            │
│                                     │
│  ├── Router Setup                   │
│  ├── Context Provider               │
│  ├── Protected Routes               │
│  ├── Auth Logic                     │
│  ├── Theme Management               │
│  ├── Build Configuration            │
│  ├── API Utilities                  │
│  └── Your Components ← 10% of code  │
│                                     │
│  90% boilerplate, 10% unique        │
└─────────────────────────────────────┘
```

#### Skateboard Application Shell Architecture

```
┌──────────────────────────────────────────────────────┐
│                  skateboard-ui                       │
│                   (The Shell)                        │
│                                                      │
│  ├── createSkateboardApp()                          │
│  │   ├── Router                                     │
│  │   ├── Context Provider                           │
│  │   ├── ProtectedRoute                             │
│  │   ├── Layout                                     │
│  │   ├── Landing/Sign In/Sign Up/Sign Out          │
│  │   └── Settings/Payment/Legal pages              │
│  │                                                   │
│  ├── Utilities                                       │
│  │   ├── API request handlers                       │
│  │   ├── Auth utilities                             │
│  │   ├── Hooks (useListData)                        │
│  │   └── (Vite config lives in the app)             │
│  │                                                   │
│  └── Base Theme (styles.css)                        │
│                                                      │
└──────────────────────────────────────────────────────┘
                          ↓
                    (provides)
                          ↓
┌──────────────────────────────────────────────────────┐
│              Your Application                        │
│                 (The Content)                        │
│                                                      │
│  ├── appRoutes = [                                  │
│  │     { path: 'home', element: <HomeView /> }     │
│  │   ]                                              │
│  │                                                   │
│  ├── components/                                     │
│  │   ├── HomeView.tsx                               │
│  │   └── CustomView.jsx                             │
│  │                                                   │
│  └── constants.json (configuration)                 │
│                                                      │
│  100% unique business logic                          │
└──────────────────────────────────────────────────────┘
```

**Result**: Apps are just routes + components + config

### Three-Part Architecture

#### 1. Shell (skateboard-ui package)

**Exports**:
- `Context` - User state management
- `App` - Application shell (createSkateboardApp)
- `Layout` - App layout wrapper
- `Components` - Landing, SignIn, SignUp, Settings, etc.
- `Utilities` - API handlers, hooks, Vite config
- `styles.css` - Complete base theme

**Responsibilities**:
- Routing infrastructure
- Authentication flow
- Context management
- Theme system
- Build configuration
- Common utilities

#### 2. Content (your app)

**Files**:
- `src/main.tsx` (~16 lines) - Route definitions
- `src/components/*.jsx` - Your views/components
- `src/assets/styles.css` (~7 lines) - Brand color override

**Responsibilities**:
- Define custom routes
- Implement business logic
- Create UI components
- Handle app-specific data

#### 3. Config (constants.json)

**Structure**:
```json
{
  "appName": "MyApp",
  "appIcon": "home",
  "tagline": "Ship fast",
  "backendURL": "https://api.myapp.com",
  "devBackendURL": "http://localhost:8000",
  "pages": [
    { "title": "Home", "url": "home", "icon": "house" }
  ],
  "features": {
    "title": "Features",
    "items": [...]
  },
  "stripeProducts": [...],
  "companyName": "Company Inc",
  "companyEmail": "support@company.com"
}
```

**Responsibilities**:
- App branding
- API endpoints
- Navigation structure
- Feature configuration
- Legal content

### File Structure Comparison

#### Before (0.9.x)

```
my-app/
├── package.json
├── vite.config.ts (227 lines - custom plugins)
├── index.html
└── src/
    ├── main.tsx (82 lines - manual setup)
    ├── context.jsx (56 lines - state management)
    ├── constants.json
    ├── assets/
    │   └── styles.css (182 lines - full theme)
    └── components/
        ├── HomeView.tsx
        └── ProfileView.jsx

Total boilerplate: ~550 lines
```

#### After (1.0.0)

```
my-app/
├── package.json
├── vite.config.ts (3 lines - uses utility)
├── index.html
└── src/
    ├── main.tsx (16 lines - route definitions only)
    ├── constants.json
    ├── assets/
    │   └── styles.css (7 lines - brand color only)
    └── components/
        ├── HomeView.tsx
        └── ProfileView.jsx

Total boilerplate: ~26 lines (95% reduction)
```

### How It Works

#### 1. Entry Point (main.tsx)

**What you write** (~16 lines):
```javascript
import './assets/styles.css';
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import constants from './constants.json';
import HomeView from './components/HomeView.tsx';
import ProfileView from './components/ProfileView.jsx';

const appRoutes = [
  { path: 'home', element: <HomeView /> },
  { path: 'profile', element: <ProfileView /> }
];

createSkateboardApp({
  constants,
  appRoutes,
  defaultRoute: 'home'
});
```

**What createSkateboardApp does** (behind the scenes):
```javascript
export function createSkateboardApp({ constants, appRoutes, defaultRoute }) {
  const container = document.getElementById('root');
  const root = createRoot(container);

  root.render(
    <ContextProvider constants={constants}>
      <Router>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/console" element={<Navigate to="/app" replace />} />
            <Route path="/app" element={<ProtectedRoute />}>
              <Route index element={<Navigate to={defaultRoute} replace />} />

              {/* Your custom routes */}
              {appRoutes.map(({ path, element }) => (
                <Route key={path} path={path} element={element} />
              ))}

              {/* Standard routes */}
              <Route path="settings" element={<SettingsView />} />
              <Route path="payment" element={<PaymentView />} />
            </Route>
          </Route>

          {/* Public routes */}
          <Route path="/" element={<LandingView />} />
          <Route path="/signin" element={<SignInView />} />
          <Route path="/signup" element={<SignUpView />} />
          <Route path="/signout" element={<SignOutView />} />

          {/* Legal routes */}
          <Route path="/terms" element={<TextView details={constants.termsOfService} />} />
          <Route path="/privacy" element={<TextView details={constants.privacyPolicy} />} />
          <Route path="/eula" element={<TextView details={constants.EULA} />} />
          <Route path="/subs" element={<TextView details={constants.subscriptionDetails} />} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </ContextProvider>
  );
}
```

**You define**: Custom routes
**Framework provides**: Everything else

#### 2. Context Management

**Import from skateboard-ui**:
```javascript
import { ContextProvider, getState } from '@stevederico/skateboard-ui/Context';
```

**Context.jsx implementation** (in skateboard-ui):
```javascript
export function ContextProvider({ children, constants }) {
  const getStorageKey = () => {
    const appName = constants.appName || 'skateboard';
    return `${appName.toLowerCase().replace(/\s+/g, '-')}_user`;
  };

  const getInitialUser = () => {
    try {
      const storageKey = getStorageKey();
      const storedUser = localStorage.getItem(storageKey);
      if (!storedUser || storedUser === "undefined") return null;
      return JSON.parse(storedUser);
    } catch (e) {
      return null;
    }
  };

  const initialState = { user: getInitialUser() };

  function reducer(state, action) {
    const storageKey = getStorageKey();
    const appName = constants.appName || 'skateboard';
    const csrfKey = `${appName.toLowerCase().replace(/\s+/g, '-')}_csrf`;

    switch (action.type) {
      case 'SET_USER':
        localStorage.setItem(storageKey, JSON.stringify(action.payload));
        return { ...state, user: action.payload };
      case 'CLEAR_USER':
        localStorage.removeItem(storageKey);
        localStorage.removeItem(csrfKey);
        return { ...state, user: null };
      default:
        return state;
    }
  }

  const [state, dispatch] = useReducer(reducer, initialState);

  return (
    <context.Provider value={{ state, dispatch }}>
      {children}
    </context.Provider>
  );
}

export function getState() {
  return useContext(context);
}
```

**Use in components**:
```javascript
import { getState } from '@stevederico/skateboard-ui/Context';

function MyComponent() {
  const { state, dispatch } = getState();

  // Access user
  const user = state.user;

  // Update user
  dispatch({ type: 'SET_USER', payload: newUser });
}
```

#### 3. Styling System

**App imports base theme**:
```css
/* src/assets/styles.css */
@import "@stevederico/skateboard-ui/styles.css";

@source '../../node_modules/@stevederico/skateboard-ui';

@theme {
  --color-app: var(--color-purple-500);
}
```

**Base theme provides** (in skateboard-ui):
- All CSS variables (light + dark mode)
- Tailwind theme configuration
- Animations (@theme inline)
- Base layer styles

**App can override**:
```css
@theme {
  --color-app: var(--color-green-500);
  --background: oklch(0.99 0 0);
  --radius: 0.5rem;
}
```

#### 4. Build Configuration

Apps own their `vite.config.ts` directly. skateboard-ui is a pure component library.

**Why?** TailwindCSS v4 uses native Rust bindings that cannot be bundled. Separating build config from runtime code keeps things clean.

**App owns vite.config.ts**:
```javascript
// vite.config.ts
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  server: { port: 5173 }
});
```

See the reference implementation for full config with SEO plugins: [skateboard/vite.config.ts](https://github.com/stevederico/skateboard/blob/master/vite.config.ts)

JSX comes from `tsconfig.json` (`"jsx": "react-jsx"`) via Vite's own transform. There is no
`@vitejs/plugin-react-swc`, so component edits trigger a full reload rather than Fast Refresh.
Do not use `vite --force` or `optimizeDeps.force: true` for everyday dev.

### Shell API

#### createSkateboardApp(config)

Creates and mounts a complete Skateboard application.

**Parameters**:
```typescript
{
  constants: object,          // Constants from constants.json
  appRoutes: Array<{          // Your custom routes
    path: string,             // Route path (no leading slash)
    element: JSX.Element      // Component to render
  }>,
  defaultRoute?: string       // Default route for /app (defaults to first route)
}
```

**Example**:
```javascript
createSkateboardApp({
  constants,
  appRoutes: [
    { path: 'home', element: <HomeView /> },
    { path: 'dashboard', element: <DashboardView /> }
  ],
  defaultRoute: 'dashboard'  // Optional
});
```

**Routes created automatically**:
- `/` - Landing page
- `/signin` - Sign in page
- `/signup` - Sign up page
- `/signout` - Sign out page
- `/app` - Protected route wrapper
- `/app/:path` - Your custom routes
- `/app/settings` - Settings page
- `/app/payment` - Payment page
- `/terms`, `/privacy`, `/eula`, `/subs` - Legal pages

#### Vite Configuration

Apps own their `vite.config.ts`. Copy from the reference implementation and customize as needed.

See: [skateboard/vite.config.ts](https://github.com/stevederico/skateboard/blob/master/vite.config.ts)

#### Context API

**ContextProvider({ children, constants })**

Provides user state to the app.

**getState()**

Hook to access state and dispatch.

```javascript
const { state, dispatch } = getState();

// state.user - Current user object or null
// dispatch({ type: 'SET_USER', payload: user })
// dispatch({ type: 'CLEAR_USER' })
```

#### API Utilities

**apiRequest(endpoint, options)**

Unified API request with automatic auth and error handling.

```javascript
// GET request
const data = await apiRequest('/deals');

// POST request
const newDeal = await apiRequest('/deals', {
  method: 'POST',
  body: JSON.stringify({ name: 'New Deal' })
});

// Custom headers
const data = await apiRequest('/deals', {
  headers: {
    'X-Custom-Header': 'value'
  }
});
```

**Features**:
- Auto-includes `credentials: 'include'`
- Auto-adds CSRF token for mutations (POST/PUT/DELETE/PATCH)
- Auto-redirects to `/signout` on 401
- Returns parsed JSON
- Throws on errors

**apiRequestWithParams(endpoint, params, options)**

API request with query parameters.

```javascript
const results = await apiRequestWithParams('/search', {
  query: 'test',
  page: 1,
  limit: 10
});
// Calls: /search?query=test&page=1&limit=10
```

#### React Hooks

**useListData(endpoint, sortFn?)**

Fetch and manage list data with automatic loading/error states.

```javascript
const { data, loading, error, refetch } = useListData(
  '/deals',
  (a, b) => new Date(b.created) - new Date(a.created)  // optional
);

if (loading) return <Spinner />;
if (error) return <Error message={error} />;

return <List items={data} />;
```

**Returns**:
```typescript
{
  data: any[],              // Fetched and sorted data
  loading: boolean,         // Loading state
  error: string | null,     // Error message
  refetch: () => Promise    // Function to refetch data
}
```

#### Vite Config Utilities

Individual plugins available for custom configurations:

**customLoggerPlugin()**
```javascript
// Simplifies Vite console output
console.log(`🖥️  React is running on http://localhost:5173`);
```

**htmlReplacePlugin()**
```javascript
// Replaces {{APP_NAME}}, {{TAGLINE}}, {{COMPANY_WEBSITE}} in index.html
// Reads from src/constants.json
```

**dynamicRobotsPlugin()**
```javascript
// Generates robots.txt with sitemap URL from constants.json
```

**dynamicSitemapPlugin()**
```javascript
// Generates sitemap.xml with pages from constants.json
```

**dynamicManifestPlugin()**
```javascript
// Generates manifest.json for PWA from constants.json
```

### Override Mechanisms

Every part of the shell can be overridden:

#### 1. Vite Configuration

Apps own their `vite.config.ts` - customize directly:

```javascript
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  server: {
    port: 3000,
    proxy: { '/api': 'http://localhost:8080' }
  },
  build: { sourcemap: true }
});
```

#### 2. Styles

**Default** (inherit everything):
```css
@import "@stevederico/skateboard-ui/styles.css";

@theme {
  --color-app: var(--color-purple-500);
}
```

**Override variables**:
```css
@import "@stevederico/skateboard-ui/styles.css";

@theme {
  --color-app: var(--color-green-500);
  --background: oklch(0.99 0 0);
  --radius: 0.5rem;
}
```

**Completely custom** (don't import):
```css
@import "tailwindcss";

/* Your complete custom theme */
```

#### 3. Components

**Default** (use skateboard-ui components):
```javascript
import Header from '@stevederico/skateboard-ui/Header';
```

**Custom component**:
```javascript
import Header from './components/CustomHeader';
```

#### 4. Routing

**Default** (use createSkateboardApp):
```javascript
createSkateboardApp({ constants, appRoutes, defaultRoute });
```

**Custom routing** (build your own):
```javascript
import { ContextProvider } from '@stevederico/skateboard-ui/Context';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

root.render(
  <ContextProvider constants={constants}>
    <BrowserRouter>
      <Routes>
        {/* Your complete custom routing */}
      </Routes>
    </BrowserRouter>
  </ContextProvider>
);
```

#### 5. Context

**Default** (use skateboard-ui Context):
```javascript
import { ContextProvider, getState } from '@stevederico/skateboard-ui/Context';
```

**Extended context** (add your own):
```javascript
import { ContextProvider as SkateboardContext } from '@stevederico/skateboard-ui/Context';

function MyContextProvider({ children }) {
  const [customState, setCustomState] = useState();

  return (
    <SkateboardContext constants={constants}>
      <MyContext.Provider value={{ customState, setCustomState }}>
        {children}
      </MyContext.Provider>
    </SkateboardContext>
  );
}
```

### Best Practices

#### 1. Use Hooks for Data Fetching

**Good** (use useListData):
```javascript
const { data, loading, error } = useListData('/deals');
```

**Avoid** (manual useState + useEffect):
```javascript
const [data, setData] = useState([]);
const [loading, setLoading] = useState(true);
useEffect(() => {
  fetch('/deals').then(r => r.json()).then(setData);
}, []);
```

#### 2. Use apiRequest for All API Calls

**Good**:
```javascript
const deal = await apiRequest('/deals', {
  method: 'POST',
  body: JSON.stringify(data)
});
```

**Avoid** (manual fetch):
```javascript
const response = await fetch(`${getBackendURL()}/deals`, {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': getCSRFToken()
  },
  body: JSON.stringify(data)
});
```

#### 3. Import Context from skateboard-ui

**Good**:
```javascript
import { getState } from '@stevederico/skateboard-ui/Context';
```

**Avoid** (local context.jsx):
```javascript
import { getState } from '../context.jsx';
```

#### 4. Keep main.tsx Minimal

**Good** (just routes):
```javascript
const appRoutes = [
  { path: 'home', element: <HomeView /> }
];

createSkateboardApp({ constants, appRoutes });
```

**Avoid** (complex logic in main.tsx):
```javascript
// Don't add business logic, API calls, or complex state here
```

#### 5. Override Only What You Need

**Good** (override pieces of the app-owned `vite.config.ts`):
```javascript
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
// …import local plugins from './vite.plugins.ts'

export default defineConfig({
  plugins: [tailwindcss() /* … */],
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  server: { port: 3000 }
});
```

**Avoid** (copy a giant unrelated config, or reintroduce `@vitejs/plugin-react-swc` / `vite --force` without a reason):
```javascript
// Prefer small, intentional overrides — JSX already works via esbuild
```

### Extension Points

#### Adding Custom Middleware

```javascript
// Not directly supported - extend at component level
function MyAuthWrapper({ children }) {
  // Custom auth logic
  return <div>{children}</div>;
}
```

#### Adding Custom Providers

Wrap ContextProvider:
```javascript
import { ContextProvider } from '@stevederico/skateboard-ui/Context';
import { ThemeProvider } from './MyThemeProvider';

<ContextProvider constants={constants}>
  <ThemeProvider>
    <App />
  </ThemeProvider>
</ContextProvider>
```

#### Adding Global State

Use composition:
```javascript
import { ContextProvider, getState as getSkateboardState } from '@stevederico/skateboard-ui/Context';

const MyContext = createContext();

export function MyProvider({ children }) {
  const [myState, setMyState] = useState();

  return (
    <MyContext.Provider value={{ myState, setMyState }}>
      {children}
    </MyContext.Provider>
  );
}

// In components
const { state, dispatch } = getSkateboardState();  // Skateboard state
const { myState } = useContext(MyContext);         // Your state
```

### Benefits

#### 1. Extreme Code Reduction
- **95% less boilerplate** per app
- Focus on features, not infrastructure
- Faster development

#### 2. Consistency Across Apps
- Same patterns everywhere
- Easier onboarding
- Shared knowledge

#### 3. Centralized Updates
- Fix bug once, all apps get fix
- Add feature once, all apps can use it
- Update dependencies once

#### 4. Flexibility
- Override anything you need
- Escape hatches everywhere
- Not locked in

#### 5. Learning Curve
- Simple mental model
- Less to learn
- Faster ramp-up

### Trade-offs

#### Benefits
✅ 95% less boilerplate
✅ Centralized maintenance
✅ Consistency across apps
✅ Faster development
✅ Easy to learn

#### Considerations
⚠️ Less explicit (magic happens in package)
⚠️ Debugging requires understanding package
⚠️ Breaking changes in package affect all apps
⚠️ Override complexity for edge cases

**Verdict**: Benefits far outweigh trade-offs for most apps

### Examples

#### Minimal App

```javascript
// main.tsx
import './assets/styles.css';
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import constants from './constants.json';
import HomeView from './components/HomeView.tsx';

createSkateboardApp({
  constants,
  appRoutes: [{ path: 'home', element: <HomeView /> }],
  defaultRoute: 'home'
});
```

```javascript
// components/HomeView.tsx
import { getState } from '@stevederico/skateboard-ui/Context';
import { useListData } from '@stevederico/skateboard-ui/Utilities';

export default function HomeView() {
  const { state } = getState();
  const { data, loading } = useListData('/items');

  return <div>Hello {state.user?.name}</div>;
}
```

#### Complex App with Overrides

```javascript
// vite.config.ts
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';

// Your plugins
const customLoggerPlugin = () => { /* ... */ };
const htmlReplacePlugin = () => { /* ... */ };
const myAnalyticsPlugin = () => { /* ... */ };

export default defineConfig({
  plugins: [
    tailwindcss(),
    customLoggerPlugin(),
    htmlReplacePlugin(),
    myAnalyticsPlugin()
  ],
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  server: {
    port: 3000,
    proxy: { '/api': 'http://backend:8080' }
  }
});
```

```css
/* styles.css */
@import "@stevederico/skateboard-ui/styles.css";

@theme {
  --color-app: var(--color-green-500);
  --radius: 0.25rem;
}

.custom-class {
  /* App-specific styles */
}
```

### Production Configuration

For production deployments, override the default config using environment variables.

#### Environment Variables

```bash
## Database: SQLite only, configured in backend/config.json (no DB env vars).
## Point database.connectionString at a path on a persistent volume.

## CORS - Comma-separated list of allowed origins
CORS_ORIGINS=https://yourapp.com,https://www.yourapp.com

## Frontend URL - Used for Stripe redirects (success/cancel URLs)
FRONTEND_URL=https://yourapp.com

## Application
NODE_ENV=production
PORT=8000

## Required for all environments
STRIPE_KEY=sk_live_your_stripe_key
STRIPE_ENDPOINT_SECRET=whsec_your_webhook_secret
JWT_SECRET=your_secure_jwt_secret

## Usage limits (optional)
FREE_USAGE_LIMIT=20
```

#### Development vs Production

| Setting | Development | Production |
|---------|-------------|------------|
| Database | SQLite (local file) | SQLite (volume) |
| CORS | localhost | CORS_ORIGINS env var |
| Redirects | localhost:5173 | FRONTEND_URL env var |

#### Docker Deployment

The included Dockerfile builds the Vite frontend, then a zero-crate Rust backend:

```bash
docker build -t skateboard .
docker run -p 8000:8000 --env-file .env skateboard
```

The multi-stage build produces a minimal production image with only the compiled frontend and backend.

---

### Summary

Skateboard's Application Shell Architecture transforms React apps from 500+ lines of boilerplate to 20 lines of routes and components. The framework handles infrastructure, you focus on features.

**Architecture:**
- **skateboard-ui** - Pure component and utility library (no build tools)
- **Your app** - Owns vite.config.ts, main.tsx, constants.json
- **Separation of concerns** - Build config ≠ Runtime library

**Key Principles**:
1. **Convention over configuration** - sensible defaults
2. **Escape hatches everywhere** - override anything
3. **Centralized maintenance** - update skateboard-ui, all apps benefit
4. **Simple mental model** - routes + components + config
5. **Pure runtime library** - no binary bundling issues

**Update Pattern**:
```bash
npm install @stevederico/skateboard-ui@latest
```
See the [Migration](#migration) section below for the full upgrade prompt to hand to an agent.

**Benefits:**
- ✅ Error boundary for robust error handling
- ✅ Automatic constants validation
- ✅ Full TailwindCSS v4 support
- ✅ Build configuration in your app (better control)
- ✅ Pure component library (smaller package, simpler)
- ✅ Cleaner separation of concerns

---

### Scaling

#### Single Instance (Default)

The Rust backend keeps two bounded in-memory stores (`backend/src/stores.rs`): issued CSRF
tokens and sign-in lockout counters. SQLite holds everything durable. One process serves
requests on a fixed thread pool.

**Works great for:**
- Single server deployments
- Development environments
- Small to medium traffic apps

#### Horizontal Scaling (Multiple Instances)

Both in-memory stores are per-process, so a CSRF token is only known to the instance that
issued it. Two supported options:

**Option 1: Sticky sessions (recommended)**
- Enable session affinity on the load balancer
- Stores work as-is; no code change

**Option 2: Accept the retry**
- A CSRF miss answers 403 *and* issues a fresh token the client can immediately retry with
- Costs one extra round-trip whenever a client switches instance

Sharing state through Redis is not supported: it would mean adding a crate, and the backend is
zero-crate by design. SQLite is also single-writer, so scale vertically first, or move the
database file onto a shared server before adding instances.

#### Cleanup Cadence

| Store | Backing | Cleanup |
|-------|---------|---------|
| CSRF tokens | Memory, bounded with oldest-first eviction | Hourly sweep of expired entries |
| Sign-in lockouts | Memory, bounded, keyed per email + IP | Every 15 minutes |
| Processed webhook ids | SQLite `WebhookEvents` | Hourly; rows older than 30 days deleted |

---

For migration and upgrade instructions, see [UPGRADE.md](UPGRADE.md)

For the reference implementation, see [github.com/stevederico/skateboard](https://github.com/stevederico/skateboard)

---

## API Reference


### Overview

The Skateboard backend provides a RESTful API for authentication, user management, payments, and usage tracking. All endpoints are prefixed with `/api`.

### Authentication

Authentication uses JWT tokens stored in HttpOnly cookies with CSRF protection.

#### Headers

State-changing requests (POST, PUT, DELETE) require a CSRF token, except `/api/signup`,
`/api/signin`, and the Stripe-signed `/api/payment` webhook:
```
X-CSRF-Token: <csrf_token>
```

#### Cookie Authentication

The `token` cookie is automatically sent with credentials. No manual token handling required.

---

### Endpoints

#### Authentication

##### POST /api/signup
Create a new user account.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword"
}
```

**Validation:**
- `name`: 1-100 characters
- `email`: Valid email, max 254 characters
- `password`: 6-72 characters

**Response (201):**
```json
{
  "id": "uuid",
  "email": "john@example.com",
  "name": "John Doe",
  "tokenExpires": 1791936000
}
```

`tokenExpires` is Unix **seconds** (it mirrors the JWT `exp` claim); every other timestamp in
this API is milliseconds. Call `GET /api/me` for the full user record.

**Cookies Set:**
- `token`: JWT token (HttpOnly, 30 days)
- `<appname>_csrf`: CSRF token (24 hours)

CSRF is **not** required on `/api/signup` or `/api/signin` — no session exists yet. Every other
state-changing route requires the `x-csrf-token` header.

---

##### POST /api/signin
Sign in to existing account.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "securepassword"
}
```

**Response (200):**
```json
{
  "_id": "uuid",
  "email": "john@example.com",
  "name": "John Doe",
  "created_at": 1789344000000,
  "subscription": {
    "stripeID": "cus_xxx",
    "status": "active",
    "expires": 1735689600
  }
}
```

**Cookies Set:** Same as signup

---

##### POST /api/signout
Sign out current user. **Requires** the auth cookie and an `x-csrf-token` header.

**Response (200):**
```json
{ "message": "Signed out successfully" }
```

**Cookies Cleared:** `token`, `<appname>_csrf`

---

#### User Management

##### GET /api/me
Get current authenticated user.

**Response (200):**
```json
{
  "_id": "uuid",
  "email": "john@example.com",
  "name": "John Doe",
  "created_at": 1789344000000,
  "subscription": { ... },
  "usage": { "count": 5, "reset_at": 1791936000000 }
}
```

---

##### PUT /api/me
Update current user profile.

**Request Body:**
```json
{
  "name": "New Name"
}
```

**Response (200):**
```json
{
  "_id": "uuid",
  "email": "john@example.com",
  "name": "New Name",
  ...
}
```

---

#### Subscription

There is no standalone subscription endpoint. Subscription state reaches the client two ways:

- `GET /api/me` returns the nested `subscription` object when the user has a Stripe customer id.
- `POST /api/usage` returns `isSubscriber` alongside the usage counters (see below).

---

#### Usage Tracking

##### POST /api/usage
Check or track usage for free users.

**Request Body:**
```json
{
  "operation": "check"
}
```
or
```json
{
  "operation": "track"
}
```

**Response (200) - Free User:**
```json
{
  "remaining": 15,
  "total": 20,
  "isSubscriber": false,
  "used": 5,
  "subscription": null
}
```

**Response (200) - Subscriber:**
```json
{
  "remaining": -1,
  "total": -1,
  "isSubscriber": true,
  "subscription": {
    "status": "active",
    "expiresAt": "2025-01-01T00:00:00.000Z"
  }
}
```

**Response (429) - Limit Reached:**
```json
{
  "error": "Usage limit reached",
  "remaining": 0,
  "total": 20,
  "isSubscriber": false
}
```

---

#### Payments (Stripe)

##### POST /api/checkout
Create Stripe checkout session. **Requires** auth + `x-csrf-token`; answers 503 when
`STRIPE_KEY` is unset. `lookup_key` must match a `stripeProducts[].lookup_key` in
`src/constants.json`; anything else is 400.

**Request Body:**
```json
{
  "email": "john@example.com",
  "lookup_key": "premium_monthly"
}
```

**Response (200):**
```json
{
  "url": "https://checkout.stripe.com/...",
  "id": "cs_xxx",
  "customerID": "cus_xxx"
}
```

---

##### POST /api/portal
Create Stripe billing portal session. **Requires** auth + `x-csrf-token`; answers 503 when
`STRIPE_KEY` is unset.

**Request Body:**
```json
{
  "customerID": "cus_xxx"
}
```

**Response (200):**
```json
{
  "url": "https://billing.stripe.com/...",
  "id": "bps_xxx"
}
```

---

##### POST /api/payment
Stripe webhook endpoint. Handles subscription events.

**Events Handled:**
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

---

#### Health Check

##### GET /api/health
Health check endpoint.

Runs a `SELECT 1` against SQLite, so the container healthcheck fails when the process
is up but the database is not.

**Response (200):**
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": 1789344000000
}
```

**Response (503)** — same shape with `"status": "degraded"` and `"database": "unavailable"`.

`timestamp` is Unix epoch **milliseconds** (as is every timestamp this API returns).

---

### Abuse Controls

There is no global per-route request quota. Targeted protections:

| Control | Scope | Behavior |
|---------|-------|----------|
| Auth rate limit | Per client IP on `/api/signup` and `/api/signin` | 20 requests per 15 minutes; 429 + `Retry-After`. Set `TRUST_PROXY` to the number of trusted reverse proxies in front of the process (`1` for a single proxy such as Railway); the key is taken Nth-from-last, never the client-supplied leftmost hop. Leave unset when exposed directly |
| Request deadline | Every HTTP request | 15s wall clock for headers+body; 30s idle keep-alive. Slow dribbles get 408. Per-syscall `read_timeout` is not enough |
| Sign-in lockout | Per email + client IP | Failed attempts accumulate in a 15-minute window; the pair locks out after the threshold and decays automatically |
| Usage limit | Per user, non-subscribers | `POST /api/usage` answers 429 once `FREE_USAGE_LIMIT` operations are consumed in the month |

Neither emits `X-RateLimit-*` headers. Put a reverse proxy or edge WAF in front of the
server if you need blanket per-IP quotas.

---

### Error Responses

All errors return JSON with an `error` field:

```json
{ "error": "Error message here" }
```

#### Status Codes

| Code | Meaning |
|------|---------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Not authenticated |
| 403 | Forbidden - Invalid CSRF or permission denied |
| 404 | Not Found - Resource doesn't exist |
| 429 | Too Many Requests - Sign-in lockout or free usage limit reached |
| 500 | Internal Server Error |
| 503 | Service Unavailable - `JWT_SECRET` or Stripe configuration missing, or the database probe failed |

---

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `JWT_SECRET` | Secret for JWT signing | Yes |
| `STRIPE_KEY` | Stripe secret key | Yes |
| `STRIPE_ENDPOINT_SECRET` | Stripe webhook secret | Yes |
| `FREE_USAGE_LIMIT` | Monthly limit for free users | No (default: 20) |
| `CORS_ORIGINS` | Comma-separated allowed origins | No |
| `FRONTEND_URL` | Frontend URL for redirects | No |
| `PORT` | Server port | No (default: 8000) |

---

### Known Limitations

#### Password Reset

Password reset functionality is not yet implemented. Users who forget their password must contact support for manual account recovery.

**Planned for future release:** Self-service password reset via email with time-limited tokens.

---

## Database Schema


### Overview

Skateboard is **SQLite only**. The backend links the system `libsqlite3` through FFI and keeps
`[dependencies]` empty, so Postgres and MongoDB are not supported — `database.dbType` in
`backend/config.json` must be `sqlite` or the server refuses to start.

### Tables/Collections

#### Users

Stores user profile and subscription information.

##### SQLite / PostgreSQL

```sql
CREATE TABLE Users (
  _id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  subscription_stripeID TEXT,
  subscription_expires BIGINT,
  subscription_status TEXT,
  usage_count INTEGER DEFAULT 0,
  usage_reset_at BIGINT
);

CREATE UNIQUE INDEX idx_users_email ON Users(email);
```

##### MongoDB

```javascript
{
  _id: String,           // UUID
  email: String,         // Unique
  name: String,
  created_at: Number,    // Unix epoch milliseconds
  subscription: {
    stripeID: String,    // Stripe customer ID
    expires: Number,     // Unix timestamp
    status: String       // "active", "canceled", etc.
  },
  usage: {
    count: Number,       // Usage count this period
    reset_at: Number     // When usage resets (Unix epoch milliseconds)
  }
}
```

**Note:** SQL databases flatten nested objects (e.g., `subscription.stripeID` → `subscription_stripeID`). Adapters handle transformation.

---

#### Auths

Stores authentication credentials separately from user data.

##### SQLite / PostgreSQL

```sql
CREATE TABLE Auths (
  email TEXT PRIMARY KEY,
  password TEXT NOT NULL,
  userID TEXT NOT NULL REFERENCES Users(_id)
);
```

##### MongoDB

```javascript
{
  email: String,    // Primary key
  password: String, // scrypt hash (legacy bcrypt still verifies, rehashed on next signin)
  userID: String    // Reference to Users._id
}
```

---

### Field Descriptions

#### Users Table

| Field | Type | Description |
|-------|------|-------------|
| `_id` | String (UUID) | Unique identifier |
| `email` | String | User's email (unique) |
| `name` | String | Display name |
| `created_at` | Unix ms | Account creation time |
| `subscription.stripeID` | String | Stripe customer ID |
| `subscription.expires` | Unix timestamp | When subscription ends |
| `subscription.status` | String | Stripe subscription status |
| `usage.count` | Integer | Actions used this period |
| `usage.reset_at` | Unix ms | When usage counter resets |

#### Auths Table

| Field | Type | Description |
|-------|------|-------------|
| `email` | String | User's email (primary key) |
| `password` | String | scrypt hash (legacy bcrypt verified, then rehashed) |
| `userID` | String | Reference to Users._id |

---

### Subscription Status Values

| Status | Description |
|--------|-------------|
| `active` | Subscription is active and paid |
| `canceled` | Canceled but access until period ends |
| `past_due` | Payment failed, grace period |
| `unpaid` | Payment failed, access revoked |
| `trialing` | In trial period |

---

### Usage Tracking

Free users have a monthly usage limit (default: 20).

- `usage.count` - Incremented on each tracked action
- `usage.reset_at` - Set to 30 days after first action
- When `now > reset_at`, counter resets to 0
- Subscribers (`subscription.status === 'active'`) get unlimited usage

---

### Database Configuration

Configuration in `backend/config.json`:

```json
{
  "database": {
    "db": "MyApp",
    "dbType": "sqlite",
    "connectionString": "./databases/MyApp.db"
  }
}
```

#### Connection Strings

**SQLite:**
```
./databases/MyApp.db
```

Postgres and Mongo are not supported. `dbType` must be `sqlite`.

Environment variable syntax `${VAR_NAME}` is supported in `connectionString`.

---

### Indexes

#### Recommended Indexes

```sql
-- Users table
CREATE UNIQUE INDEX idx_users_email ON Users(email);
CREATE INDEX idx_users_subscription ON Users(subscription_status);

-- Auths table
CREATE INDEX idx_auths_userid ON Auths(userID);
```

MongoDB automatically indexes `_id`. Create email index:

```javascript
db.Users.createIndex({ email: 1 }, { unique: true });
```

---

### Data Transformation

Adapters transform between nested and flat structures:

**API Response (nested):**
```json
{
  "subscription": {
    "stripeID": "cus_xxx",
    "status": "active"
  }
}
```

**SQL Storage (flat):**
```sql
subscription_stripeID = 'cus_xxx'
subscription_status = 'active'
```

Schema is created on first open in `backend/src/db.rs` (`ensure_schema`).

---

### Migration Notes

SQLite is the only supported database. There is no Postgres or Mongo adapter.

---

## Deployment


Deploy your Skateboard app to production.

### Prerequisites

- GitHub repository with your Skateboard app
- Stripe account (for payments)
- Hosting account (Vercel, Render, or Netlify)

### Environment Variables

All platforms require these environment variables:

```bash
## Required
JWT_SECRET=your_super_secure_jwt_secret_here
STRIPE_KEY=sk_test_your_stripe_secret_key
STRIPE_ENDPOINT_SECRET=whsec_your_webhook_secret
CORS_ORIGINS=https://yourapp.com
FRONTEND_URL=https://yourapp.com

## Optional
FREE_USAGE_LIMIT=20            # Monthly limit for free users
```

### Stripe Webhook Setup

For all platforms, configure your Stripe webhook:

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) → Developers → Webhooks
2. Click "Add endpoint"
3. URL: `https://your-backend-url/api/payment`
4. Select events (match `process_webhook` in `backend/src/routes.rs`):
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Copy the signing secret to `STRIPE_ENDPOINT_SECRET`

**Tests:** `cargo test` covers Stripe signature verification, form encoding, circuit breaker, webhook-event DB idempotency, portal customer ownership, and **mocked** route integration for `POST /api/payment` (all handled event types + idempotency) and `POST /api/checkout` (session create, unknown lookup key, email mismatch). Mock transport never calls the network.

**Live Stripe is opt-in only — not CI.** The ignored test `stripe::tests::live_customer_lookup` needs `STRIPE_TEST_KEY` + `STRIPE_TEST_CUSTOMER`. For webhook replay against a local server:

```bash
cd backend && cargo run   # terminal 1
./backend/scripts/stripe-cli-replay.sh   # terminal 2 (requires stripe CLI)
# or: stripe listen --forward-to localhost:8000/api/payment
#     stripe trigger checkout.session.completed
```

Do not put live Stripe keys or stripe-cli into GitHub Actions.

---

### Vercel (frontend only)

The Rust backend is a long-running process. Host it on Railway, Render, or Docker. Vercel can serve the Vite `dist/` frontend.

1. Go to [vercel.com](https://vercel.com) → New Project
2. Import your GitHub repository
3. Configure:
   - Framework Preset: Other
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Point `src/constants.json` `backendURL` at the Rust host
5. Deploy

---

### Render

Separate services for frontend (Static Site) and backend (Web Service).

#### 1. Deploy Backend

1. Go to [render.com](https://render.com) → New → Web Service
2. Connect your GitHub repository
3. Configure:
   - Name: `skateboard-backend`
   - Root Directory: `backend`
   - Runtime: Docker, using the repo-root `Dockerfile` (the backend is Rust, not Node)
   - Health Check Path: `/api/health`
4. Add environment variables (`JWT_SECRET` is mandatory in production; the server refuses to start without a 32+ character value)
5. Attach a persistent disk mounted where `database.connectionString` points, or SQLite data is lost on every deploy
6. Deploy and copy the backend URL

#### 2. Deploy Frontend

1. Go to Render → New → Static Site
2. Connect the same repository
3. Configure:
   - Name: `skateboard-frontend`
   - Build Command: `npm run build`
   - Publish Directory: `dist`
4. Deploy

#### 3. Update Configuration

Update `src/constants.json`:
```json
{ "backendURL": "https://skateboard-backend.onrender.com" }
```

Set the backend's environment (there is no `client` field in `backend/config.json`):
```bash
CORS_ORIGINS=https://skateboard-frontend.onrender.com
FRONTEND_URL=https://skateboard-frontend.onrender.com
```

---

### Netlify + Railway

Netlify for frontend, Railway for backend.

#### 1. Deploy Backend to Railway

1. Go to [railway.app](https://railway.app) → New Project
2. Deploy from GitHub repo
3. Configure:
   - Build Command: `cargo build --release --manifest-path backend/Cargo.toml`
   - Start Command: `./backend/target/release/skateboard-backend`
4. Add environment variables
5. Deploy and copy the backend URL

#### 2. Deploy Frontend to Netlify

1. Go to [netlify.com](https://netlify.com) → New site from Git
2. Connect your GitHub repository
3. Configure:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Deploy

#### 3. Update Configuration

Update `src/constants.json`:
```json
{ "backendURL": "https://yourapp.up.railway.app" }
```

Set the backend's environment on Railway (there is no `client` field in `backend/config.json`):
```bash
CORS_ORIGINS=https://random-name.netlify.app
FRONTEND_URL=https://random-name.netlify.app
```

---

### Docker Deployment

Use the included Dockerfile for container deployments.

```bash
docker build -t skateboard .
docker run -p 8000:8000 --env-file .env skateboard
```

See [Production Configuration](#production-configuration) above for environment configuration.

---

### Go Live Checklist

- [ ] Environment variables set on hosting platform
- [ ] `constants.json` backendURL updated
- [ ] `config.json` client URL updated
- [ ] Stripe webhook configured with production URL
- [ ] Live Stripe keys configured (`sk_live_...`)
- [ ] Test sign up / sign in flow
- [ ] Test payment flow
- [ ] Monitor logs for errors

### Troubleshooting

**API routes not working?**
- Check CORS_ORIGINS includes your frontend URL
- Verify backendURL in constants.json

**Stripe webhooks failing?**
- Verify webhook URL ends with `/api/payment`
- Check STRIPE_ENDPOINT_SECRET matches

**Auth not persisting?**
- Check FRONTEND_URL is set correctly
- Verify cookies are being sent (credentials: include)

---

## Migration

Upgrade an existing skateboard project with the bundled updater — it is version-agnostic
(reads the current pins from the reference repo, no hardcoded versions to go stale) and
3-way-merges template files and deletes the old Node/Hono backend (4.17.0+ is zero-crate Rust):

```bash
node scripts/update-skateboard.js          # interactive — diff per file
node scripts/update-skateboard.js --yes    # apply all without prompts
```

Then install, sync the version label, and validate:

```bash
npm install                                # root deps + lockfile
npm run typecheck && npm run test
cd backend && cargo test --locked
```

After applying, bump both `version` and `skateboardVersion` in `package.json` to match the
release you upgraded to (these must stay equal — a stale `skateboardVersion` is a lie).

> Full step-by-step guide, the pre-TypeScript (`.jsx` → `.tsx`) migration path, and an agent
> prompt that automates the whole upgrade: **[docs/UPGRADE.md](UPGRADE.md)**.
>
> Do NOT hardcode dependency pins in this doc — they rot every release. Always resolve current
> versions from the reference repo's `package.json`: https://github.com/stevederico/skateboard
