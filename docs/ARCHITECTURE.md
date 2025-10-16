# Skateboard Architecture Documentation

## Overview

Skateboard uses an **Application Shell Architecture** (also known as **Inversion of Control** or **Template Method Pattern**), where the framework (skateboard-ui) provides the structure, and your app provides the content.

**Philosophy**: "Convention over configuration with escape hatches everywhere"

## Core Concept

### Traditional React App Architecture

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

### Skateboard Application Shell Architecture

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

## Three-Part Architecture

### 1. Shell (skateboard-ui package)

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

### 2. Content (your app)

**Files**:
- `src/main.jsx` (~16 lines) - Route definitions
- `src/components/*.jsx` - Your views/components
- `src/assets/styles.css` (~7 lines) - Brand color override

**Responsibilities**:
- Define custom routes
- Implement business logic
- Create UI components
- Handle app-specific data

### 3. Config (constants.json)

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

## File Structure Comparison

### Before (0.9.x)

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

### After (1.0.0)

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

## How It Works

### 1. Entry Point (main.jsx)

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

### 2. Context Management

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

### 3. Styling System

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

### 4. Build Configuration (v1.1.0+)

**Important Change**: In skateboard-ui v1.1.0, build configuration moved from the package to individual apps.

**Why?** TailwindCSS v4 uses native Rust bindings (.node files) that cannot be bundled for browser runtime. skateboard-ui is now a pure component library.

**App owns vite.config.js** (v1.1.0+):
```javascript
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';

// All build plugins now defined in your app
const customLoggerPlugin = () => { /* ... */ };
const htmlReplacePlugin = () => { /* ... */ };
const dynamicRobotsPlugin = () => { /* ... */ };
const dynamicSitemapPlugin = () => { /* ... */ };
const dynamicManifestPlugin = () => { /* ... */ };

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    customLoggerPlugin(),
    htmlReplacePlugin(),
    dynamicRobotsPlugin(),
    dynamicSitemapPlugin(),
    dynamicManifestPlugin()
  ],
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      '@radix-ui/react-slot',
      'cookie',
      'set-cookie-parser'
    ],
    exclude: [
      '@swc/core',
      '@tailwindcss/oxide',
      'lightningcss',
      'fsevents'
    ]
  },
  server: {
    host: 'localhost',
    port: 5173
  }
});
```

**App can customize** any part:
```javascript
export default defineConfig({
  plugins: [...],
  server: {
    port: 3000,
    proxy: { '/api': 'http://localhost:8080' }
  },
  build: {
    sourcemap: true
  }
});
```

**For v1.0.7 and earlier** (deprecated):
```javascript
// Old pattern - no longer used
import { getSkateboardViteConfig } from '@stevederico/skateboard-ui/Utilities';
export default getSkateboardViteConfig();
```

## API Reference

### createSkateboardApp(config)

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

### Vite Configuration (v1.1.0+)

**Note**: `getSkateboardViteConfig()` was removed in v1.1.0. Build configuration is now in your app.

**Available build plugins** (copy to your vite.config.js):
- `customLoggerPlugin()` - Clean console output
- `htmlReplacePlugin()` - Replace {{APP_NAME}} etc in index.html
- `dynamicRobotsPlugin()` - Generate robots.txt
- `dynamicSitemapPlugin()` - Generate sitemap.xml
- `dynamicManifestPlugin()` - Generate manifest.json

See the reference implementation: [skateboard/vite.config.js](https://github.com/stevederico/skateboard/blob/master/vite.config.js)

### Context API

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

### API Utilities

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

### React Hooks

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

### Vite Config Utilities

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

## Override Mechanisms

Every part of the shell can be overridden:

### 1. Vite Configuration

**Default**:
```javascript
export default getSkateboardViteConfig();
```

**Override specific settings**:
```javascript
export default getSkateboardViteConfig({
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:8080'
    }
  },
  plugins: [customPlugin()],
  build: {
    sourcemap: true
  }
});
```

**Completely custom** (don't use utility):
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  // Your complete custom config
});
```

### 2. Styles

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

### 3. Components

**Default** (use skateboard-ui components):
```javascript
import Header from '@stevederico/skateboard-ui/Header';
```

**Custom component**:
```javascript
import Header from './components/CustomHeader';
```

### 4. Routing

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

### 5. Context

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

## Best Practices

### 1. Use Hooks for Data Fetching

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

### 2. Use apiRequest for All API Calls

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

### 3. Import Context from skateboard-ui

**Good**:
```javascript
import { getState } from '@stevederico/skateboard-ui/Context';
```

**Avoid** (local context.jsx):
```javascript
import { getState } from '../context.jsx';
```

### 4. Keep main.jsx Minimal

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

### 5. Override Only What You Need

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

## Extension Points

### Adding Custom Middleware

```javascript
// Not directly supported - extend at component level
function MyAuthWrapper({ children }) {
  // Custom auth logic
  return <div>{children}</div>;
}
```

### Adding Custom Providers

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

### Adding Global State

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

## Benefits

### 1. Extreme Code Reduction
- **95% less boilerplate** per app
- Focus on features, not infrastructure
- Faster development

### 2. Consistency Across Apps
- Same patterns everywhere
- Easier onboarding
- Shared knowledge

### 3. Centralized Updates
- Fix bug once, all apps get fix
- Add feature once, all apps can use it
- Update dependencies once

### 4. Flexibility
- Override anything you need
- Escape hatches everywhere
- Not locked in

### 5. Learning Curve
- Simple mental model
- Less to learn
- Faster ramp-up

## Trade-offs

### Benefits
✅ 95% less boilerplate
✅ Centralized maintenance
✅ Consistency across apps
✅ Faster development
✅ Easy to learn

### Considerations
⚠️ Less explicit (magic happens in package)
⚠️ Debugging requires understanding package
⚠️ Breaking changes in package affect all apps
⚠️ Override complexity for edge cases

**Verdict**: Benefits far outweigh trade-offs for most apps

## Examples

### Minimal App

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

### Complex App with Overrides

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

## Summary

Skateboard's Application Shell Architecture (v1.1.0+) transforms React apps from 500+ lines of boilerplate to 20 lines of routes and components. The framework handles infrastructure, you focus on features.

**Architecture (v1.1.0):**
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
# Update package
npm install @stevederico/skateboard-ui@1.1.0

# Copy vite.config.js from reference if upgrading from 1.0.x
# All other code works as-is
```

**Benefits in v1.1.0:**
- ✅ Full TailwindCSS v4 support (native bindings excluded)
- ✅ Build configuration in your app (better control)
- ✅ Pure component library (smaller package, simpler)
- ✅ No ESM/CommonJS conversion issues
- ✅ Cleaner separation of concerns

---

For migration instructions, see `MIGRATION_GUIDE.md`

For the reference implementation, see [github.com/stevederico/skateboard](https://github.com/stevederico/skateboard)
