# Skateboard Guide

Complete reference for the Skateboard boilerplate. Quick links:

- [Architecture](#architecture) — Application Shell pattern, structure, scaling
- [API Reference](#api-reference) — REST endpoints
- [Database Schema](#database-schema) — Tables, fields, multi-DB adapters
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
│  │   ├── Hooks (useListData, useForm)              │
│  │   └── Vite config generator                     │
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
│  │   ├── HomeView.jsx                               │
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
- `src/main.jsx` (~16 lines) - Route definitions
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
├── vite.config.js (227 lines - custom plugins)
├── index.html
└── src/
    ├── main.jsx (82 lines - manual setup)
    ├── context.jsx (56 lines - state management)
    ├── constants.json
    ├── assets/
    │   └── styles.css (182 lines - full theme)
    └── components/
        ├── HomeView.jsx
        └── ProfileView.jsx

Total boilerplate: ~550 lines
```

#### After (1.0.0)

```
my-app/
├── package.json
├── vite.config.js (3 lines - uses utility)
├── index.html
└── src/
    ├── main.jsx (16 lines - route definitions only)
    ├── constants.json
    ├── assets/
    │   └── styles.css (7 lines - brand color only)
    └── components/
        ├── HomeView.jsx
        └── ProfileView.jsx

Total boilerplate: ~26 lines (95% reduction)
```

### How It Works

#### 1. Entry Point (main.jsx)

**What you write** (~16 lines):
```javascript
import './assets/styles.css';
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import constants from './constants.json';
import HomeView from './components/HomeView.jsx';
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

Apps own their `vite.config.js` directly. skateboard-ui is a pure component library.

**Why?** TailwindCSS v4 uses native Rust bindings that cannot be bundled. Separating build config from runtime code keeps things clean.

**App owns vite.config.js**:
```javascript
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 }
});
```

See the reference implementation for full config with SEO plugins: [skateboard/vite.config.js](https://github.com/stevederico/skateboard/blob/master/vite.config.js)

### API Reference

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

Apps own their `vite.config.js`. Copy from the reference implementation and customize as needed.

See: [skateboard/vite.config.js](https://github.com/stevederico/skateboard/blob/master/vite.config.js)

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

**useForm(initialValues, onSubmit)**

Form state management with validation and submission handling.

```javascript
const { values, handleChange, handleSubmit, reset, submitting, error } = useForm(
  { name: '', email: '' },
  async (values) => {
    await apiRequest('/users', {
      method: 'POST',
      body: JSON.stringify(values)
    });
  }
);

return (
  <form onSubmit={handleSubmit}>
    <input value={values.name} onChange={handleChange('name')} />
    <input value={values.email} onChange={handleChange('email')} />
    <button disabled={submitting}>Submit</button>
    {error && <div>{error}</div>}
  </form>
);
```

**Returns**:
```typescript
{
  values: object,                         // Current form values
  handleChange: (field) => (e) => void,   // Change handler creator
  handleSubmit: (e) => Promise,           // Submit handler
  reset: () => void,                      // Reset to initial values
  submitting: boolean,                    // Submission state
  error: string | null                    // Error message
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

Apps own their `vite.config.js` - customize directly:

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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

#### 4. Keep main.jsx Minimal

**Good** (just routes):
```javascript
const appRoutes = [
  { path: 'home', element: <HomeView /> }
];

createSkateboardApp({ constants, appRoutes });
```

**Avoid** (complex logic in main.jsx):
```javascript
// Don't add business logic, API calls, or complex state here
```

#### 5. Override Only What You Need

**Good** (minimal override):
```javascript
export default getSkateboardViteConfig({
  server: { port: 3000 }
});
```

**Avoid** (copy entire config):
```javascript
// Don't duplicate the entire config, just override what changes
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
// main.jsx
import './assets/styles.css';
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import constants from './constants.json';
import HomeView from './components/HomeView.jsx';

createSkateboardApp({
  constants,
  appRoutes: [{ path: 'home', element: <HomeView /> }],
  defaultRoute: 'home'
});
```

```javascript
// components/HomeView.jsx
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
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';

// Your plugins
const customLoggerPlugin = () => { /* ... */ };
const htmlReplacePlugin = () => { /* ... */ };
const myAnalyticsPlugin = () => { /* ... */ };

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    customLoggerPlugin(),
    htmlReplacePlugin(),
    myAnalyticsPlugin()
  ],
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
## Database (overrides config.json database settings)
DATABASE_URL=postgresql://user:pass@host:5432/prod_db
## or
MONGODB_URL=mongodb+srv://user:pass@cluster.mongodb.net/prod_db

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
| Database | SQLite (local config) | PostgreSQL/MongoDB (env vars) |
| CORS | localhost | CORS_ORIGINS env var |
| Redirects | localhost:5173 | FRONTEND_URL env var |

#### Docker Deployment

The included Dockerfile uses the Node.js runtime:

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
- **Your app** - Owns vite.config.js, main.jsx, constants.json
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

The default configuration uses in-memory stores:

```javascript
const csrfTokenStore = new Map();  // CSRF tokens
```

**Works great for:**
- Single server deployments
- Development environments
- Small to medium traffic apps

#### Horizontal Scaling (Multiple Instances)

For multiple server instances behind a load balancer:

**Option 1: Redis (Recommended)**
```javascript
// Replace in-memory stores with Redis
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

// Rate limiting
await redis.incr(`ratelimit:${ip}`);
await redis.expire(`ratelimit:${ip}`, 900); // 15 min

// CSRF tokens
await redis.set(`csrf:${userID}`, token, 'EX', 86400); // 24 hours
```

**Option 2: Sticky Sessions**
- Configure load balancer for session affinity
- Users always hit the same server
- In-memory stores work as-is

**Option 3: Database Storage**
- Store CSRF tokens in user table
- Use database for rate limiting (slower)

#### Current Limits

| Store | Max Entries | Cleanup |
|-------|-------------|---------|
| Rate Limit | 10,000 IPs | Hourly LRU |
| CSRF Tokens | 50,000 users | Hourly expiry |

These limits handle significant traffic on a single instance.

---

For migration instructions, see `MIGRATION.md`

For the reference implementation, see [github.com/stevederico/skateboard](https://github.com/stevederico/skateboard)

---

## API Reference


### Overview

The Skateboard backend provides a RESTful API for authentication, user management, payments, and usage tracking. All endpoints are prefixed with `/api`.

### Authentication

Authentication uses JWT tokens stored in HttpOnly cookies with CSRF protection.

#### Headers

State-changing requests (POST, PUT, DELETE) require a CSRF token:
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

**Response (200):**
```json
{
  "_id": "uuid",
  "email": "john@example.com",
  "name": "John Doe",
  "created_at": 1704067200,
  "subscription": null,
  "usage": { "count": 0, "reset_at": null }
}
```

**Cookies Set:**
- `token`: JWT token (HttpOnly, 30 days)
- `<appname>_csrf`: CSRF token (24 hours)

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
  "created_at": 1704067200,
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
Sign out current user.

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
  "created_at": 1704067200,
  "subscription": { ... },
  "usage": { "count": 5, "reset_at": 1706745600 }
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

##### GET /api/isSubscriber
Check if current user has active subscription.

**Response (200):**
```json
{ "isSubscriber": true }
```
or
```json
{ "isSubscriber": false }
```

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
Create Stripe checkout session.

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
Create Stripe billing portal session.

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

**Response (200):**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "database": "connected"
}
```

---

### Rate Limiting

| Route Type | Limit | Window |
|------------|-------|--------|
| Auth routes (`/signin`, `/signup`) | 10 requests | 15 minutes |
| Payment routes (`/checkout`, `/portal`) | 5 requests | 15 minutes |
| All other routes | 300 requests | 15 minutes |

Rate limit headers:
- `X-RateLimit-Remaining`: Requests remaining
- `Retry-After`: Seconds until limit resets (on 429)

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
| 429 | Too Many Requests - Rate limited |
| 500 | Internal Server Error |
| 503 | Service Unavailable - Auth disabled |

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

Skateboard supports three database types through a unified adapter pattern:
- **SQLite** (default) - File-based, zero configuration
- **PostgreSQL** - Production-ready relational database
- **MongoDB** - Document-based NoSQL database

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
  created_at: Number,    // Unix timestamp
  subscription: {
    stripeID: String,    // Stripe customer ID
    expires: Number,     // Unix timestamp
    status: String       // "active", "canceled", etc.
  },
  usage: {
    count: Number,       // Usage count this period
    reset_at: Number     // When usage resets (Unix timestamp)
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
  password: String, // bcrypt hash
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
| `created_at` | Unix timestamp | Account creation time |
| `subscription.stripeID` | String | Stripe customer ID |
| `subscription.expires` | Unix timestamp | When subscription ends |
| `subscription.status` | String | Stripe subscription status |
| `usage.count` | Integer | Actions used this period |
| `usage.reset_at` | Unix timestamp | When usage counter resets |

#### Auths Table

| Field | Type | Description |
|-------|------|-------------|
| `email` | String | User's email (primary key) |
| `password` | String | bcrypt hash (10 rounds) |
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

**PostgreSQL:**
```
postgresql://user:password@localhost:5432/myapp
${DATABASE_URL}
```

**MongoDB:**
```
mongodb://localhost:27017
${MONGODB_URL}
```

Environment variable syntax `${VAR_NAME}` is supported for production deployments.

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

This is handled automatically by the database adapters in `backend/adapters/`.

---

### Migration Notes

When switching database types:

1. Export data from current database
2. Transform nested ↔ flat structure as needed
3. Import to new database
4. Update `config.json` with new `dbType` and `connectionString`

The adapter pattern ensures API compatibility regardless of database backend.

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
POSTGRES_URL=postgresql://...  # If using PostgreSQL
MONGODB_URL=mongodb://...      # If using MongoDB
FREE_USAGE_LIMIT=20            # Monthly limit for free users
```

### Stripe Webhook Setup

For all platforms, configure your Stripe webhook:

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) → Developers → Webhooks
2. Click "Add endpoint"
3. URL: `https://your-backend-url/api/payment`
4. Select events:
   - `customer.subscription.created`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`
5. Copy the signing secret to `STRIPE_ENDPOINT_SECRET`

---

### Vercel (Recommended)

Single deployment for both frontend and backend.

#### 1. Create vercel.json

```json
{
  "version": 2,
  "builds": [
    { "src": "backend/server.js", "use": "@vercel/node" },
    { "src": "package.json", "use": "@vercel/static-build" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "backend/server.js" },
    { "src": "/(.*)", "dest": "$1" }
  ],
  "buildCommand": "npm run build"
}
```

#### 2. Update Backend for Vercel

Add to end of `backend/server.js`:

```javascript
export default app;
```

#### 3. Deploy

1. Go to [vercel.com](https://vercel.com) → New Project
2. Import your GitHub repository
3. Configure:
   - Framework Preset: Other
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Add environment variables
5. Deploy

#### 4. Update Configuration

Update `src/constants.json`:
```json
{ "backendURL": "/api" }
```

Update `backend/config.json`:
```json
{
  "client": "https://yourproject.vercel.app",
  "database": { ... }
}
```

---

### Render

Separate services for frontend (Static Site) and backend (Web Service).

#### 1. Deploy Backend

1. Go to [render.com](https://render.com) → New → Web Service
2. Connect your GitHub repository
3. Configure:
   - Name: `skateboard-backend`
   - Root Directory: `backend`
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Add environment variables
5. Deploy and copy the backend URL

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

Update `backend/config.json`:
```json
{
  "client": "https://skateboard-frontend.onrender.com",
  "database": { ... }
}
```

---

### Netlify + Railway

Netlify for frontend, Railway for backend.

#### 1. Deploy Backend to Railway

1. Go to [railway.app](https://railway.app) → New Project
2. Deploy from GitHub repo
3. Configure:
   - Build Command: `npm install --workspace=backend`
   - Start Command: `npm run --workspace=backend start`
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

Update `backend/config.json`:
```json
{
  "client": "https://random-name.netlify.app",
  "database": { ... }
}
```

---

### Docker Deployment

Use the included Dockerfile for container deployments.

```bash
docker build -t skateboard .
docker run -p 8000:8000 --env-file .env skateboard
```

See [ARCHITECTURE.md](ARCHITECTURE.md#production-configuration) for environment configuration.

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
handles the TypeScript file renames (`backend/server.js` → `backend/server.ts`, etc.) with a
3-way merge that preserves your edits:

```bash
node scripts/update-skateboard.js          # interactive — diff per file
node scripts/update-skateboard.js --yes    # apply all without prompts
```

Then install, sync the version label, and validate:

```bash
npm install                                # root deps + lockfile
npm install --workspace=backend            # backend deps
npm run typecheck && npm run test          # gate the upgrade
```

After applying, bump both `version` and `skateboardVersion` in `package.json` to match the
release you upgraded to (these must stay equal — a stale `skateboardVersion` is a lie).

> Full step-by-step guide, the pre-TypeScript (`.jsx` → `.tsx`) migration path, and an agent
> prompt that automates the whole upgrade: **[docs/UPGRADE.md](UPGRADE.md)**.
>
> Do NOT hardcode dependency pins in this doc — they rot every release. Always resolve current
> versions from the reference repo's `package.json`: https://github.com/stevederico/skateboard
