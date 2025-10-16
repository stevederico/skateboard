# Migration Guide: skateboard-ui 1.1.0

## Overview

This guide covers migrating from skateboard-ui **0.9.x** to **1.1.0**, which introduces the **Application Shell Architecture**—a paradigm shift that eliminates nearly all boilerplate from your apps.

**Migration Time**: ~15 minutes per app

### What is Application Shell Architecture?

Your app becomes three simple pieces:
1. **Shell** (from skateboard-ui package) - Framework, routing, context, utilities, UI components
2. **Content** (your code) - Components and business logic
3. **Config** (constants.json) - App-specific configuration

**Result**: Apps go from ~500 lines of boilerplate to ~20 lines of app-specific code.

## What's New in 1.1.0

### skateboard-ui@1.1.0 (Pure UI Library)

**skateboard-ui is now a pure component and utility library**—all Vite build configuration has been moved to individual apps.

**Core Components:**
- `Context` - ContextProvider and getState (no need to define locally)
- `App` - createSkateboardApp() function with wrapper support (replaces manual setup)
- `DynamicIcon` - Icon component using lucide-react (use instead of direct imports)
- `Layout`, `LandingView`, `SignInView`, `SignUpView`, `SignOutView`, `PaymentView`, `SettingsView`, `ProtectedRoute` - Complete UI shell

**Utilities:**
- `apiRequest()` - Unified API request handler with CSRF and auth
- `apiRequestWithParams()` - API requests with query parameters
- `useListData()` - Hook for fetching and managing list data
- `useForm()` - Hook for form state management
- `getCookie()`, `setCookie()` - Cookie utilities

**Base Theme:**
- `styles.css` - Complete theme system (182 lines) available for import

**Key Change in 1.1.0:**
- ✅ Removed `getSkateboardViteConfig()` - Build config now in each app's vite.config.js
- ✅ Removed all Vite plugins from skateboard-ui
- ✅ Fixed TailwindCSS v4 native module bundling issues
- ✅ Simplified package for pure runtime usage

## Benefits

### Before (0.9.x): ~500 lines of boilerplate per app
```
src/
├── context.jsx (56 lines)
├── main.jsx (82 lines)
├── assets/styles.css (182 lines)
└── vite.config.js (227 lines)
Total: 547 lines of boilerplate
```

### After (1.0.0): ~20 lines of app-specific code
```
src/
├── main.jsx (16 lines - just routes)
├── assets/styles.css (7 lines - just brand color)
└── vite.config.js (3 lines - just config call)
Total: 26 lines
```

**Reduction**: 95% less boilerplate
**Benefit**: Update skateboard-ui once, all apps inherit improvements

## Prerequisites

- skateboard-ui 0.9.8 or higher (starting point)
- React 19.2+
- Vite 7.1+
- deno 2.5+ (for package management)

## Migration Steps

### 1. Update Dependencies

```bash
# Update skateboard-ui to 1.0.7
deno install npm:@stevederico/skateboard-ui@1.0.7

# Add tailwindcss-animate if not present
deno install npm:tailwindcss-animate@^1.0.7

# Install all dependencies
deno install
```

**Update package.json:**
```json
{
  "dependencies": {
    "@stevederico/skateboard-ui": "^1.0.7",
    "tailwindcss-animate": "^1.0.7"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.14",
    "@vitejs/plugin-react-swc": "^4.1.0",
    "tailwindcss": "4.1.14",
    "vite": "^7.1.10"
  }
}
```

### 2. Simplify styles.css

**Before (0.9.x)**: 182 lines with full theme
```css
@import "tailwindcss";
@source '../../node_modules/@stevederico/skateboard-ui';
@custom-variant dark (&:is(.dark *));

@theme {
  --color-app: var(--color-purple-500);
}

:root {
  --background: oklch(0.985 0 0);
  --foreground: oklch(0.145 0 0);
  /* ... 150+ more lines */
}

.dark {
  /* ... 50+ more lines */
}

@theme inline {
  /* ... 40+ more lines */
}
```

**After (1.0.0)**: 7 lines importing base theme
```css
@import "@stevederico/skateboard-ui/styles.css";

@source '../../node_modules/@stevederico/skateboard-ui';

@theme {
  --color-app: var(--color-purple-500);
}
```

**What changed:**
- Import base theme from skateboard-ui
- Override only your brand color
- All other CSS variables inherited

**App Brand Color Override:**
Each app should override `--color-app` to match its brand identity:
```css
@import "@stevederico/skateboard-ui/styles.css";

@source '../../node_modules/@stevederico/skateboard-ui';

@theme {
  --color-app: var(--color-green-500);  /* Your app's brand color */
}
```

**Available colors:** `--color-red-500`, `--color-orange-500`, `--color-yellow-500`, `--color-green-500`, `--color-blue-500`, `--color-purple-500`, `--color-pink-500`, `--color-cyan-500`, `--color-teal-500`

**To override other variables (optional):**
```css
@import "@stevederico/skateboard-ui/styles.css";

@theme {
  --color-app: var(--color-purple-500);
  --background: oklch(0.99 0 0);  /* Custom background */
  --radius: 0.5rem;               /* Custom border radius */
}
```

### 3. Vite Configuration (v1.1.0)

**Important Change in 1.1.0**: Build configuration is now in your app, not imported from skateboard-ui.

**Why?** skateboard-ui v1.1.0 is a pure runtime library. TailwindCSS v4 uses native bindings (.node files) that cannot be bundled for browser runtime. By keeping build config in your app, we avoid binary bundling issues.

**New Approach (1.1.0+)**: Copy vite.config.js to your app

Your `vite.config.js` should contain all Vite plugins directly:

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';

// Custom plugins defined in your app
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
  // ... rest of config
});
```

**Migration path from 1.0.7 → 1.1.0:**

If you're on 1.0.7, your app likely had a minimal vite.config.js:
```javascript
import { getSkateboardViteConfig } from '@stevederico/skateboard-ui/Utilities';
export default getSkateboardViteConfig();
```

**Update to 1.1.0** by copying the full config from the reference implementation at [skateboard/vite.config.js](https://github.com/stevederico/skateboard/blob/master/vite.config.js).

### 4. Delete context.jsx

**Before (0.9.x)**: Every app has its own context.jsx (56 lines)
```bash
# Delete your local context.jsx
rm src/context.jsx
```

**After (1.0.0)**: Import from skateboard-ui
```javascript
import { ContextProvider, getState } from '@stevederico/skateboard-ui/Context';
```

The Context export handles:
- User state management
- App-specific localStorage keys
- SET_USER and CLEAR_USER actions
- Safe error handling

### 5. Rewrite main.jsx

**Before (0.9.x)**: 82 lines with manual setup
```javascript
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from 'react-router-dom';
import { useEffect } from 'react';
import './assets/styles.css';
import Layout from '@stevederico/skateboard-ui/Layout';
import LandingView from '@stevederico/skateboard-ui/LandingView';
import TextView from '@stevederico/skateboard-ui/TextView';
import SignUpView from '@stevederico/skateboard-ui/SignUpView';
import SignInView from '@stevederico/skateboard-ui/SignInView';
import SignOutView from '@stevederico/skateboard-ui/SignOutView';
import PaymentView from '@stevederico/skateboard-ui/PaymentView';
import SettingsView from '@stevederico/skateboard-ui/SettingsView';
import NotFound from '@stevederico/skateboard-ui/NotFound';
import ProtectedRoute from '@stevederico/skateboard-ui/ProtectedRoute';
import { useAppSetup } from '@stevederico/skateboard-ui/Utilities';
import { ContextProvider, getState } from './context.jsx';
import constants from './constants.json';

import HomeView from './components/HomeView.jsx'
import ChatView from './components/ChatView.jsx'

const App = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { dispatch } = getState();

  useEffect(() => {
    document.title = constants.appName;
  }, []);

  useAppSetup(location, navigate, dispatch);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/console" element={<Navigate to="/app" replace />} />
        <Route path="/app" element={<ProtectedRoute />}>
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<HomeView />} />
          <Route path="chat" element={<ChatView />} />
          <Route path="settings" element={<SettingsView />} />
          <Route path="payment" element={<PaymentView />} />
        </Route>
      </Route>
      <Route path="/" element={<LandingView />} />
      <Route path="/signin" element={<SignInView />} />
      <Route path="/signup" element={<SignUpView />} />
      <Route path="/signout" element={<SignOutView />} />
      <Route path="/terms" element={<TextView details={constants.termsOfService} />} />
      <Route path="/privacy" element={<TextView details={constants.privacyPolicy} />} />
      <Route path="/eula" element={<TextView details={constants.EULA} />} />
      <Route path="/subs" element={<TextView details={constants.subscriptionDetails} />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  <ContextProvider>
    <Router>
      <App />
    </Router>
  </ContextProvider>
);
```

**After (1.0.0)**: 16 lines defining only your routes
```javascript
import './assets/styles.css';
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import constants from './constants.json';
import HomeView from './components/HomeView.jsx';
import ChatView from './components/ChatView.jsx';

const appRoutes = [
  { path: 'home', element: <HomeView /> },
  { path: 'chat', element: <ChatView /> }
];

createSkateboardApp({
  constants,
  appRoutes,
  defaultRoute: 'home'
});
```

**What createSkateboardApp does automatically:**
- ✅ Sets up Router, Routes, Layout
- ✅ Adds ProtectedRoute wrapper
- ✅ Includes LandingView, SignIn, SignUp, SignOut
- ✅ Adds Settings, Payment routes
- ✅ Adds TextView routes (terms, privacy, EULA, subs)
- ✅ Sets up ContextProvider
- ✅ Handles 404 (NotFound)
- ✅ Manages document.title
- ✅ Configures dark mode

**You only define:** Your app's custom routes

### 6. (Optional) Add Custom Context Wrapper

**New in 1.0.6-1.0.7:** If your app needs additional context providers (like a FavoritesProvider, ThemeProvider, etc.) that need access to skateboard's ContextProvider, use the `wrapper` parameter:

```javascript
import './assets/styles.css';
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import { FavoritesProvider } from './contexts/FavoritesContext';
import constants from './constants.json';
import HomeView from './components/HomeView.jsx';
import MapView from './components/MapView.jsx';

const appRoutes = [
  { path: 'home', element: <HomeView /> },
  { path: 'map', element: <MapView /> }
];

// Custom wrapper to include FavoritesProvider
const AppWrapper = ({ children }) => (
  <FavoritesProvider>
    {children}
  </FavoritesProvider>
);

createSkateboardApp({
  constants,
  appRoutes,
  defaultRoute: 'home',
  wrapper: AppWrapper  // ← Add wrapper parameter
});
```

**Example FavoritesContext that uses getState():**
```javascript
import { createContext, useContext, useState, useEffect } from 'react';
import { getState } from '@stevederico/skateboard-ui/Context';

const FavoritesContext = createContext();

export function FavoritesProvider({ children }) {
  const { state } = getState(); // Works because wrapper is inside ContextProvider
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    if (state.user) {
      // Fetch user's favorites
    }
  }, [state.user]);

  return (
    <FavoritesContext.Provider value={{ favorites, setFavorites }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export const useFavorites = () => useContext(FavoritesContext);
```

**Important:** The wrapper renders **inside** ContextProvider (fixed in 1.0.7), so your custom providers can access `getState()` from skateboard-ui.

### 7. Update Component Imports

Components that imported from local context.jsx need to update:

**Before (0.9.x):**
```javascript
import { getState } from '../context.jsx';
```

**After (1.0.0):**
```javascript
import { getState } from '@stevederico/skateboard-ui/Context';
```

**Find and replace:**
```bash
# Find files importing local context
grep -r "from.*context.jsx" src/components/

# Update imports in each file
```

Common files to update:
- All view components (HomeView.jsx, ChatView.jsx, etc.)
- Any component using `getState()`

### 8. Use DynamicIcon Instead of lucide-react

**Important**: Do NOT import `lucide-react` directly in your app components. Use skateboard-ui's `DynamicIcon` component instead.

**Before (incorrect):**
```javascript
import { Trash2, Check, ArrowUp } from 'lucide-react';

function MyComponent() {
  return (
    <>
      <Trash2 size={16} />
      <Check size={14} />
      <ArrowUp size={20} />
    </>
  );
}
```

**After (correct):**
```javascript
import DynamicIcon from '@stevederico/skateboard-ui/DynamicIcon';

function MyComponent() {
  return (
    <>
      <DynamicIcon name="trash-2" size={16} />
      <DynamicIcon name="check" size={14} />
      <DynamicIcon name="arrow-up" size={20} />
    </>
  );
}
```

**Why this matters:**
- ✅ Icons come from skateboard-ui's lucide-react dependency
- ✅ No need to add lucide-react to your app's package.json
- ✅ Consistent with Application Shell Architecture
- ✅ Update icons in one place (skateboard-ui)
- ✅ Works with Deno's node_modules structure

**Icon name conversion:**
- PascalCase → kebab-case
- `Trash2` → `"trash-2"`
- `ArrowUp` → `"arrow-up"`
- `MessageCircle` → `"message-circle"`

**Find and replace:**
```bash
# Find files importing lucide-react
grep -r "from 'lucide-react'" src/components/

# Update each file to use DynamicIcon
```

**Remove from package.json:**
```json
{
  "dependencies": {
    "lucide-react": "^0.537.0"  // ← Remove this line
  }
}
```

## New Features in 1.0.0

### 1. API Request Utilities

Unified API handling with automatic CSRF and auth:

```javascript
import { apiRequest, apiRequestWithParams } from '@stevederico/skateboard-ui/Utilities';

// Simple GET request
const deals = await apiRequest('/deals');

// POST with body
const newDeal = await apiRequest('/deals', {
  method: 'POST',
  body: JSON.stringify({ name: 'New Deal' })
});

// GET with query parameters
const results = await apiRequestWithParams('/search', {
  query: 'test',
  page: 1
});
```

**Features:**
- ✅ Auto-includes credentials
- ✅ Auto-adds CSRF token for mutations
- ✅ Auto-redirects on 401
- ✅ JSON error handling

### 2. React Hooks

**useListData** - Fetch and manage list data:
```javascript
import { useListData } from '@stevederico/skateboard-ui/Utilities';

function DealsView() {
  const { data, loading, error, refetch } = useListData(
    '/deals',
    (a, b) => new Date(b.created) - new Date(a.created) // optional sort
  );

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return <div>{data.map(deal => <Deal key={deal.id} {...deal} />)}</div>;
}
```

**useForm** - Form state management:
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
      <input value={values.amount} onChange={handleChange('amount')} />
      <button disabled={submitting}>Create</button>
      {error && <div>{error}</div>}
    </form>
  );
}
```

### 3. Vite Config Utilities

Individual plugins available for custom configs:

```javascript
import {
  customLoggerPlugin,
  htmlReplacePlugin,
  dynamicRobotsPlugin,
  dynamicSitemapPlugin,
  dynamicManifestPlugin
} from '@stevederico/skateboard-ui/Utilities';

// Use specific plugins only
export default defineConfig({
  plugins: [
    react(),
    customLoggerPlugin(),
    myCustomPlugin()
  ]
});
```

## Migration Checklist

### Files to Update
- [ ] **package.json** - Update to skateboard-ui@1.0.0, remove lucide-react if present
- [ ] **src/assets/styles.css** - Replace with import statement (7 lines)
- [ ] **vite.config.js** - Replace with getSkateboardViteConfig() (3 lines)
- [ ] **src/context.jsx** - DELETE (use import from skateboard-ui)
- [ ] **src/main.jsx** - Rewrite using createSkateboardApp() (~16 lines)
- [ ] **src/components/*.jsx** - Update context imports, replace lucide-react with DynamicIcon

### Testing
- [ ] App starts without errors
- [ ] Landing page loads
- [ ] Sign in/Sign up flows work
- [ ] Protected routes redirect properly
- [ ] Settings and payment pages load
- [ ] Dark mode toggle works
- [ ] All your custom routes work
- [ ] API calls succeed with CSRF tokens
- [ ] Build completes successfully

### Commands to Run
```bash
# Install dependencies
deno install

# Test dev server
deno run start

# Test production build
deno run prod
```

## Troubleshooting

### "Cannot find module '@stevederico/skateboard-ui/Context'"

**Cause**: Using skateboard-ui < 1.0.0

**Fix**: Update package.json and reinstall:
```bash
deno install npm:@stevederico/skateboard-ui@1.0.0
deno install
```

### "Cannot find module '@stevederico/skateboard-ui/App'"

Same as above - update to 1.0.0

### "getSkateboardViteConfig is not a function"

**Cause**: Using skateboard-ui < 1.0.0 or wrong import

**Fix**:
```javascript
// Correct
import { getSkateboardViteConfig } from '@stevederico/skateboard-ui/Utilities';
export default getSkateboardViteConfig();

// Wrong - defineConfig not needed
import { defineConfig } from 'vite';
import { getSkateboardViteConfig } from '@stevederico/skateboard-ui/Utilities';
export default defineConfig(getSkateboardViteConfig()); // Remove defineConfig wrapper
```

### Styles not applied

**Cause**: Missing @import in styles.css

**Fix**: Ensure first line is:
```css
@import "@stevederico/skateboard-ui/styles.css";
```

### Routes not working

**Cause**: Incorrect appRoutes format

**Fix**: Ensure routes array format:
```javascript
const appRoutes = [
  { path: 'home', element: <HomeView /> },
  { path: 'profile', element: <ProfileView /> }
];
// Path should NOT have leading slash
```

### Dark mode not working

**Cause**: Using old ThemeToggle pattern

**Fix**: ThemeToggle should work automatically. Check that:
- styles.css imports base theme
- No custom dark mode code interfering

### "Module not found: Can't resolve '../context.jsx'"

**Cause**: Component still importing local context

**Fix**: Update imports in components:
```javascript
// Change this:
import { getState } from '../context.jsx';

// To this:
import { getState } from '@stevederico/skateboard-ui/Context';
```

### "Failed to resolve import 'lucide-react'"

**Cause**: App components directly importing lucide-react instead of using DynamicIcon

**Fix**: Use DynamicIcon from skateboard-ui:
```javascript
// Change this:
import { Trash2, Check } from 'lucide-react';
<Trash2 size={16} />

// To this:
import DynamicIcon from '@stevederico/skateboard-ui/DynamicIcon';
<DynamicIcon name="trash-2" size={16} />
```

Remove lucide-react from package.json:
```bash
# Remove the dependency
grep -v "lucide-react" package.json > package.json.tmp
mv package.json.tmp package.json

# Or manually edit package.json and remove:
# "lucide-react": "^0.537.0"

# Reinstall
deno install
```

## Advanced Usage

### Custom Route Configuration

Add extra routes or override defaults:

```javascript
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import { Route } from 'react-router-dom';
import CustomLanding from './components/CustomLanding';

const appRoutes = [
  { path: 'home', element: <HomeView /> },
  { path: 'admin', element: <AdminView /> }
];

// Note: To override default routes like landing, you'll need to
// fork the App component or build custom routing
```

### Custom Vite Config

Override any Vite setting:

```javascript
import { getSkateboardViteConfig } from '@stevederico/skateboard-ui/Utilities';

export default getSkateboardViteConfig({
  // Add custom proxy
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  },

  // Add custom plugins
  plugins: [myPlugin()],

  // Override build settings
  build: {
    sourcemap: true,
    minify: 'esbuild'
  }
});
```

### Custom Styles

Override specific theme variables:

```css
@import "@stevederico/skateboard-ui/styles.css";

@theme {
  --color-app: var(--color-green-500);
  --background: oklch(0.99 0 0);
  --radius: 0.5rem;
}

/* Add custom classes */
.my-custom-class {
  background: var(--color-app);
}
```

## Comparison: Before vs After

### File Count
- **Before**: 4 boilerplate files (context.jsx, main.jsx, styles.css, vite.config.js)
- **After**: 3 minimal files (main.jsx, styles.css, vite.config.js)

### Lines of Code
- **Before**: ~550 lines of boilerplate
- **After**: ~26 lines total (95% reduction)

### Maintenance
- **Before**: Update each app individually when patterns change
- **After**: Update skateboard-ui package, all apps inherit changes

### Learning Curve
- **Before**: Must understand React Router, Context API, Vite config
- **After**: Define routes array, done

## Version Compatibility

| skateboard-ui | Status | Notes |
|--------------|--------|-------|
| 1.1.0 | ✅ Current | Pure UI library, build config in apps, TailwindCSS v4 native modules fixed |
| 1.0.8 | ⚠️ Upgrade | Fixed cookie@1.0.2 ESM export error in Deno (deprecated) |
| 1.0.7 | ⚠️ Upgrade | Fixed wrapper rendering, wrapper inside ContextProvider (deprecated) |
| 1.0.6 | ⚠️ Upgrade | Added wrapper parameter support (deprecated) |
| 1.0.5 | ⚠️ Upgrade | Fixed internal context imports (deprecated) |
| 1.0.4 | ⚠️ Upgrade | Removed initializeUtilities (deprecated) |
| 1.0.0 | ⚠️ Upgrade | Application Shell Architecture base (deprecated) |
| 0.9.8 | ⚠️ Upgrade | Migration recommended (deprecated) |
| 0.9.x | ⚠️ Upgrade | Use this guide (deprecated) |
| 0.8.x | ❌ Upgrade to 0.9.8 first | Use MIGRATION_GUIDE-0.9.8.md |

## Update from 1.0.x to 1.1.0

**Major architectural change**: Build configuration moved from skateboard-ui to individual apps.

### Why the change?

TailwindCSS v4 uses Rust-based native bindings (.node files) that cannot be bundled for browser runtime. skateboard-ui v1.1.0 is now a pure component and utility library without build tools.

**Result:**
- ✅ No more binary bundling issues
- ✅ Simpler skateboard-ui package
- ✅ Each app owns its build configuration
- ✅ Full control over Vite settings per app

### Update Steps

#### 1. Update package.json

```bash
npm install @stevederico/skateboard-ui@1.1.0
npm install
```

**Update dependencies:**
```json
{
  "dependencies": {
    "@stevederico/skateboard-ui": "1.1.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-router-dom": "^7.9.4",
    "tailwindcss-animate": "^1.0.7"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.14",
    "@vitejs/plugin-react-swc": "^4.1.0",
    "tailwindcss": "4.1.14",
    "vite": "^7.1.10"
  }
}
```

#### 2. Update vite.config.js

**Old (1.0.7):**
```javascript
import { getSkateboardViteConfig } from '@stevederico/skateboard-ui/Utilities';
export default getSkateboardViteConfig();
```

**New (1.1.0):** Copy full config from [skateboard reference](https://github.com/stevederico/skateboard/blob/master/vite.config.js)

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';

// All plugins now defined in your app
const customLoggerPlugin = () => {
  return {
    name: 'custom-logger',
    configureServer(server) {
      server.printUrls = () => {
        console.log(`🖥️  React is running on http://localhost:${server.config.server.port || 5173}`);
      };
    }
  };
};

// ... other plugins

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
  // ... rest of config
});
```

#### 3. Remove unused dependencies

If you were only importing `getSkateboardViteConfig`, there are no other code changes needed.

#### 4. Test

```bash
npm run start    # Dev server
npm run build    # Production build
```

**Expected result:**
- ✅ Dev server starts on http://localhost:5173
- ✅ No TailwindCSS native module errors
- ✅ Build completes without errors
- ✅ All functionality works identically

### Key Differences from 1.0.7

| Feature | 1.0.7 | 1.1.0 |
|---------|-------|-------|
| Vite config | Imported from skateboard-ui | In your app |
| Build plugins | From skateboard-ui | Copy to app |
| skateboard-ui size | Larger (includes build utils) | Smaller (pure runtime) |
| TailwindCSS v4 support | Limited | Full ✅ |
| Native modules | Bundled (breaks) | Excluded ✅ |
| Cookie handling | Pre-bundled (ESM errors) | Manual inclusion ✅ |

### Migration Complete!

Your app is now on v1.1.0 with full control over Vite configuration and no more native module issues.

---

## Update from 1.0.0-1.0.6 to 1.0.7

If you're already on skateboard-ui 1.0.0+, follow these quick steps to update to 1.0.7:

### 1. Update package.json

```bash
deno install npm:@stevederico/skateboard-ui@1.0.7
deno install
```

**Update package.json:**
```json
{
  "dependencies": {
    "@stevederico/skateboard-ui": "^1.0.7"
  }
}
```

### 2. Remove initializeUtilities Call (if present)

If you have this in your `src/main.jsx`, remove it:

**Before (1.0.0-1.0.3):**
```javascript
import './assets/styles.css';
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import { initializeUtilities } from '@stevederico/skateboard-ui/Utilities';
import constants from './constants.json';
import HomeView from './components/HomeView.jsx';

const appRoutes = [
  { path: 'home', element: <HomeView /> }
];

initializeUtilities(constants);  // ← Remove this

createSkateboardApp({
  constants,
  appRoutes,
  defaultRoute: 'home'
});
```

**After (1.0.4+):**
```javascript
import './assets/styles.css';
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import constants from './constants.json';
import HomeView from './components/HomeView.jsx';

const appRoutes = [
  { path: 'home', element: <HomeView /> }
];

createSkateboardApp({
  constants,
  appRoutes,
  defaultRoute: 'home'
});
```

**What changed:**
- `initializeUtilities(constants)` no longer needed (removed in 1.0.4)
- `createSkateboardApp()` handles initialization automatically
- Cleaner main.jsx with no side effects

### 3. Update Wrapper Usage (if applicable)

**If you're using custom context providers** (like FavoritesProvider), 1.0.7 fixes a critical bug where the wrapper was rendered outside ContextProvider. No code changes needed—just update the package!

**Before 1.0.7 (broken):**
```
Wrapper (outside)
  └─ ContextProvider
     └─ App
```
Custom providers couldn't access `getState()` ❌

**After 1.0.7 (fixed):**
```
ContextProvider
  └─ Wrapper (inside)
     └─ App
```
Custom providers can access `getState()` ✅

### 4. Verify and Test

```bash
deno install
deno run start

# Test in browser
# ✅ Landing page loads
# ✅ Sign in/Sign up flows work
# ✅ App routes work
# ✅ API calls succeed
# ✅ Custom context providers work (if using wrapper parameter)

# Test production build
deno run prod
```

**That's it!** Your app is now on 1.0.7.

## Next Steps

1. Migrate one app first (test project recommended)
2. Verify all functionality works
3. Test production build
4. Deploy and monitor
5. Migrate remaining apps

## Support

- **Reference Implementation**: [github.com/stevederico/skateboard](https://github.com/stevederico/skateboard)
- **Issues**: [github.com/stevederico/skateboard-ui/issues](https://github.com/stevederico/skateboard-ui/issues)
- **Architecture Docs**: See `ARCHITECTURE.md` for deep dive

## Summary

skateboard-ui 1.1.0 transforms your apps from traditional React projects with hundreds of lines of boilerplate into clean, minimal applications that focus on your unique features.

**Migration time**: ~15 minutes per app (from 0.9.x) or ~5 minutes (from 1.0.x)
**Benefit**: Update once, fix everywhere
**Result**: 95% less boilerplate, 100% more focus on features

**Key improvements in 1.1.0:**
- ✅ Fully compatible with TailwindCSS v4 native bindings
- ✅ Build configuration in each app (no more binary bundling issues)
- ✅ Pure component and utility library (smaller skateboard-ui package)
- ✅ Better control over app-specific build settings
- ✅ Resolved cookie/set-cookie-parser ESM issues
- ✅ Cleaner architecture: UI library + app configuration

**Architecture (v1.1.0):**
```
skateboard-ui (pure runtime library)
├── Components (Layout, SignIn, etc.)
├── Context (ContextProvider, getState)
├── Utilities (apiRequest, useListData, etc.)
└── styles.css (base theme)

skateboard (or your app)
├── vite.config.js (build configuration)
├── src/main.jsx (app routing)
├── src/constants.json (app config)
└── src/components (app features)
```

---

**Ready to migrate?**

- **From 0.9.x?** Follow the full migration guide from the top
- **From 1.0.x?** Jump to "Update from 1.0.x to 1.1.0"

The [skateboard reference implementation](https://github.com/stevederico/skateboard) demonstrates the complete v1.1.0 pattern. Start with one app, verify it works, then migrate the rest.
