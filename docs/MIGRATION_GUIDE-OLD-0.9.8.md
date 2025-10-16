# Migration Guide: skateboard-ui 0.9.8

## Overview

This guide covers migrating **any project** (regardless of age) to skateboard-ui 0.9.8 using the modern structure of [skateboard 0.9.4](https://github.com/stevederico/skateboard) while preserving your unique application code.

**Goal**: Make your project's **structure and boilerplate** identical to skateboard 0.9.4, while keeping your custom components, business logic, and features intact.

### What is Skateboard 0.9.4?

Skateboard 0.9.4 is the **official boilerplate template** that demonstrates:
- ✅ Zero code duplication (all utilities imported from skateboard-ui)
- ✅ Modern authentication (httpOnly cookies + CSRF)
- ✅ Standard file structure (main.jsx, context.jsx, styles.css)
- ✅ Consistent patterns across all apps

### What Gets Replaced vs What Stays

**Replace (match skateboard 0.9.4 exactly):**
- File structure and organization
- Authentication boilerplate (`isAuthenticated`, `ProtectedRoute`, etc.)
- Dark mode handling (`ThemeToggle` component only)
- Context pattern (user state management)
- Routing structure (main.jsx)
- CSS variables and theming (styles.css)
- Import patterns (use skateboard-ui exports)

**Keep (your unique code):**
- Custom components (HomeView, ProfileView, etc.)
- Business logic and features
- API endpoints and data models
- App-specific constants and configuration
- Custom routes and navigation
- Your application's functionality

## What's New

### skateboard-ui 0.9.8
- **Exported utilities**: `isAuthenticated()`, `getCSRFToken()`, `getAppKey()`, `useAppSetup()`
- **Exported component**: `ProtectedRoute` - no need to define in every app
- **ThemeToggle component**: Standard dark mode handling
- SignInView, SignUpView, and SignOutView all include `credentials: 'include'`
- SignOutView component for proper session cleanup
- Modern color system with consistent theming

## Benefits

1. **XSS Protection**: JWT in httpOnly cookies can't be stolen via JavaScript injection
2. **CSRF Protection**: Double-submit cookie pattern prevents cross-site attacks
3. **Automatic Token Handling**: Cookies sent automatically, no manual header management
4. **Secure Signout**: Proper server-side session termination
5. **Graceful Migration**: Old tokens automatically cleared, users just re-authenticate

## Prerequisites

- skateboard-ui 0.9.8 or higher
- Compatible backend (skateboard backend recommended)
- deno 2.5+ (for package management)

## Notes on Backend

This guide focuses on **frontend migration to skateboard-ui 0.9.8**.

**Recommended backend**: `@stevederico/skateboard/backend` workspace

No backend changes required for this migration - any backend compatible with skateboard-ui works.

## Frontend Migration

### 1. Update skateboard-ui

```bash
deno install npm:@stevederico/skateboard-ui@0.9.8
deno install
```

### 2. Import Exported Utilities (NEW in 0.9.8)

skateboard-ui now exports all helper functions - **no need to duplicate code in your app**.

```javascript
import {
  isAuthenticated,
  getCSRFToken,
  getAppKey,
  useAppSetup
} from '@stevederico/skateboard-ui/Utilities';
import ProtectedRoute from '@stevederico/skateboard-ui/ProtectedRoute';
```

**What's exported:**
- `isAuthenticated()` - Check if user is authenticated via CSRF token
- `getCSRFToken()` - Get CSRF token for authenticated requests
- `getAppKey(suffix)` - Generate app-specific localStorage keys
- `useAppSetup(location)` - Hook for title and dark mode management
- `ProtectedRoute` - Component for protecting routes (no need to define)

### 3. Update All Fetch Calls

#### GET Requests

**Before**:
```javascript
import { getCookie } from '@stevederico/skateboard-ui/Utilities';

fetch(`${getBackendURL()}/events`, {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getCookie('token')}`
  }
})
```

**After**:
```javascript
fetch(`${getBackendURL()}/events`, {
  method: 'GET',
  credentials: 'include',  // Sends httpOnly cookies automatically
  headers: {
    'Content-Type': 'application/json'
  }
})
```

#### POST/PUT/DELETE Requests (Mutations)

**Before**:
```javascript
import { getCookie } from '@stevederico/skateboard-ui/Utilities';

fetch(`${getBackendURL()}/events`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getCookie('token')}`
  },
  body: JSON.stringify(data)
})
```

**After** (0.9.8+ with exported utilities):
```javascript
import { getCSRFToken, getBackendURL } from '@stevederico/skateboard-ui/Utilities';

// Use exported getCSRFToken() - no need to define it yourself
const csrfToken = getCSRFToken();
fetch(`${getBackendURL()}/events`, {
  method: 'POST',
  credentials: 'include',  // Sends httpOnly cookies
  headers: {
    'Content-Type': 'application/json',
    ...(csrfToken && { 'X-CSRF-Token': csrfToken })
  },
  body: JSON.stringify(data)
})
```

### 4. Update SignIn Component Usage

**Before** (0.8.x):
```javascript
import SignIn from '@stevederico/skateboard-ui/SignIn';

<SignIn
  onSignIn={(user) => {
    // Manual state management
    setUser(user);
  }}
/>
```

**After** (0.9.5+):
```javascript
import SignIn from '@stevederico/skateboard-ui/SignIn';

<SignIn
  onSignIn={(user) => {
    // Still available for additional actions
    console.log('User signed in:', user);
  }}
/>
// Component now handles auth state automatically via context
```

### 5. Add SignOut Route

**IMPORTANT**: Add the `/signout` route to your routing configuration.

skateboard-ui 0.9.6 now includes a SignOutView component that handles session cleanup automatically.

**Before** (0.8.x):
```javascript
import SignInView from '@stevederico/skateboard-ui/SignInView';
import SignUpView from '@stevederico/skateboard-ui/SignUpView';

<Route path="/signin" element={<SignInView />} />
<Route path="/signup" element={<SignUpView />} />
```

**After** (0.9.6+):
```javascript
import SignInView from '@stevederico/skateboard-ui/SignInView';
import SignUpView from '@stevederico/skateboard-ui/SignUpView';
import SignOutView from '@stevederico/skateboard-ui/SignOutView';

<Route path="/signin" element={<SignInView />} />
<Route path="/signup" element={<SignUpView />} />
<Route path="/signout" element={<SignOutView />} />
```

The `SignOutView` component automatically:
- Calls backend `POST /signout` with `credentials: 'include'`
- Clears CSRF token from localStorage
- Redirects to `/signin`

### 6. Update Component Naming (Breaking Changes)

skateboard-ui 0.9.5 renamed some components for consistency:

**StripeView → PaymentView**
```javascript
// Before
import StripeView from '@stevederico/skateboard-ui/StripeView';
<Route path="/stripe" element={<StripeView />} />

// After
import PaymentView from '@stevederico/skateboard-ui/PaymentView';
<Route path="/stripe" element={<PaymentView />} />
```

### 7. Standard Context Pattern (Use getAppKey for consistency)

**Standard context.jsx** (from skateboard 0.9.4 template):
```javascript
import React, { createContext, useContext, useReducer } from 'react';
import constants from './constants.json';

const context = createContext();

// Create app-specific storage key using app name
const getStorageKey = () => {
  const appName = constants.appName || 'skateboard';
  return `${appName.toLowerCase().replace(/\s+/g, '-')}_user`;
};

// Safely parse user from localStorage, fallback to null on error
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

const initialState = {
  user: getInitialUser()
};

function reducer(state, action) {
  try {
    const storageKey = getStorageKey();
    const appName = constants.appName || 'skateboard';
    const csrfKey = `${appName.toLowerCase().replace(/\s+/g, '-')}_csrf`;

    switch (action.type) {
      case 'SET_USER':
        localStorage.setItem(storageKey, JSON.stringify(action.payload));
        return { ...state, user: action.payload };
      case 'CLEAR_USER':
        localStorage.removeItem(storageKey);
        localStorage.removeItem(csrfKey); // Clear CSRF token
        return { ...state, user: null };
      default:
        return state;
    }
  } catch (e) {
    return state;
  }
}

export function ContextProvider({ children }) {
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

**Key points:**
- Manages user state in localStorage
- CLEAR_USER also clears CSRF token (important for signout flow)
- Uses try/catch for safety
- No cookie clearing needed (backend handles httpOnly cookies)

### 8. Simplified main.jsx (Use Exported Utilities - NO Duplicate Code)

**Modern main.jsx** (from skateboard 0.9.4 template):

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

**Key improvements:**
- ✅ Import `ProtectedRoute` from skateboard-ui (no need to define)
- ✅ Use `useAppSetup()` hook (handles title and dark mode)
- ✅ No duplicate `isAuthenticated()` function needed
- ✅ Clean, minimal main.jsx with zero boilerplate
- ✅ All routes in one place

### 9. Update styles.css (IMPORTANT for consistency)

**Modern styles.css** (from skateboard 0.9.4 template):

**CRITICAL**: Verify `@plugin 'tailwindcss-animate'` is present on line 5. This is required for animations to work properly.

```css
@import "tailwindcss";

@source '../../node_modules/@stevederico/skateboard-ui';

@plugin 'tailwindcss-animate';  /* ← REQUIRED - animations won't work without this */

@custom-variant dark (&:is(.dark *));

@theme {
  --color-app: var(--color-purple-500);
}

:root {
  --background: oklch(0.985 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(0.985 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.96 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --radius: 0.625rem;
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.96 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.205 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.145 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.985 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.28 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.396 0.141 25.723);
  --destructive-foreground: oklch(0.637 0.237 25.331);
  --border: oklch(0.269 0 0);
  --input: oklch(0.269 0 0);
  --ring: oklch(0.439 0 0);
  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: var(--accent);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(0.269 0 0);
  --sidebar-ring: oklch(0.439 0 0);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --animate-accordion-down: accordion-down 0.2s ease-out;
  --animate-accordion-up: accordion-up 0.2s ease-out;

  @keyframes accordion-down {
    from {
      height: 0;
    }
    to {
      height: var(--radix-accordion-content-height);
    }
  }

  @keyframes accordion-up {
    from {
      height: var(--radix-accordion-content-height);
    }
    to {
      height: 0;
    }
  }
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-white dark:bg-black text-foreground;
  }
}

@layer base {
  :root {
    --sidebar-background: 0 0% 98%;
    --sidebar-foreground: 240 5.3% 26.1%;
    --sidebar-primary: 240 5.9% 10%;
    --sidebar-primary-foreground: 0 0% 98%;
    --sidebar-accent: 240 4.8% 95.9%;
    --sidebar-accent-foreground: 240 5.9% 10%;
    --sidebar-border: 220 13% 91%;
    --sidebar-ring: 217.2 91.2% 59.8%;
  }

  .dark {
    --sidebar-background: 240 5.9% 10%;
    --sidebar-foreground: 240 4.8% 95.9%;
    --sidebar-primary: 224.3 76.3% 48%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 240 3.7% 15.9%;
    --sidebar-accent-foreground: 240 4.8% 95.9%;
    --sidebar-border: 240 3.7% 15.9%;
    --sidebar-ring: 217.2 91.2% 59.8%;
  }
}
```

**Key changes from old versions:**
- Uses `@plugin 'tailwindcss-animate'` instead of importing separately
- Light mode: `--background: oklch(0.985 0 0)` (slightly off-white for app views)
- Light mode: `--accent: oklch(0.96 0 0)` (lighter accent)
- Dark mode: `--background: oklch(0.205 0 0)` (slightly lighter than pure black)
- Dark mode: `--accent: oklch(0.28 0 0)` (distinct from background)
- Consistent sidebar colors
- Simplified body styling using `bg-white dark:bg-black`

**Note**: For SignInView/SignUpView pages that need pure white backgrounds, the components already use `bg-white` which overrides the slightly off-white `--background`.

**Best Practice**: Remove any commented-out CSS variables or code for cleaner maintenance.

### 10. Clean Up Component Files (Remove Duplicate Utilities)

**IMPORTANT**: Many apps have duplicate helper functions in component files that should be imported from skateboard-ui instead.

**Common duplicates to remove:**

1. **Duplicate getCSRFToken() in component files**

**❌ WRONG** (old pattern - found in many apps):
```javascript
// In YourView.jsx
import { getBackendURL } from '@stevederico/skateboard-ui/Utilities';

// Helper to get CSRF token
function getCSRFToken() {
  const appName = constants.appName || 'your-app';
  const csrfKey = `${appName.toLowerCase().replace(/\s+/g, '-')}_csrf`;
  return localStorage.getItem(csrfKey);
}

export default function YourView() {
  // component code
}
```

**✅ CORRECT** (import from skateboard-ui):
```javascript
// In YourView.jsx
import { getBackendURL, getCSRFToken } from '@stevederico/skateboard-ui/Utilities';

export default function YourView() {
  // component code
}
```

2. **Remove unused imports from main.jsx**

Many apps import utilities they don't use:
```javascript
// ❌ Don't import utilities you don't need
import { useAppSetup, isAuthenticated, getCSRFToken, getAppKey } from '@stevederico/skateboard-ui/Utilities';

// ✅ Only import what you use
import { useAppSetup } from '@stevederico/skateboard-ui/Utilities';
```

**How to find duplicates:**
```bash
# Search for duplicate getCSRFToken functions
grep -r "function getCSRFToken" src/components/

# Search for duplicate isAuthenticated functions
grep -r "function isAuthenticated" src/
```

### 11. Update index.html Body Style

**IMPORTANT**: Many apps have restrictive body styles that can cause scrolling issues on LandingView.

**❌ WRONG** (prevents scrolling):
```html
<body style="height: 100%; overflow: hidden;">
  <div id="root"></div>
</body>
```

**✅ CORRECT** (per skateboard 0.9.4):
```html
<body style="overscroll-behavior: none;">
  <div id="root"></div>
</body>
```

**Why this matters:**
- `height: 100%; overflow: hidden` prevents page scrolling
- LandingView is designed as a full scrollable landing page
- `overscroll-behavior: none` prevents rubber-band scrolling without blocking vertical scroll

### 12. Use ThemeToggle Component (REQUIRED - No Custom Dark Mode Logic)

**IMPORTANT**: skateboard-ui 0.9.8 provides `ThemeToggle` component for ALL dark mode functionality. **Never implement custom dark mode detection or switching.**

**❌ NEVER do this** (custom dark mode logic):
```javascript
// DON'T write custom theme detection
useEffect(() => {
  const storedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = storedTheme ? storedTheme === 'dark' : prefersDark;
  document.documentElement.classList.toggle('dark', isDark);
  document.body.classList.toggle('dark', isDark);
}, []);

// DON'T write custom theme toggle buttons
<button onClick={() => toggleTheme()}>
  {isDark ? 'Light' : 'Dark'}
</button>
```

**✅ ALWAYS do this** (use ThemeToggle):
```javascript
import ThemeToggle from '@stevederico/skateboard-ui/ThemeToggle';

export function HeaderActions() {
  return (
    <div className="flex items-center gap-3">
      <ThemeToggle className="text-gray-600 dark:text-gray-300" iconSize={20} />
      {/* other header actions */}
    </div>
  );
}
```

**What ThemeToggle does automatically:**
- ✅ Detects system preference on first load
- ✅ Persists user choice in localStorage (`theme` key)
- ✅ Applies `dark` class to `<html>` element
- ✅ Provides consistent UI across all apps
- ✅ Supports `variant="landing"` for marketing pages
- ✅ Supports `variant="settings"` (default minimal style)

**Remove ALL custom dark mode code:**
- Delete custom `useState` for theme
- Delete custom `useEffect` for theme detection
- Delete custom localStorage theme logic
- Delete custom `window.matchMedia` checks
- Delete custom classList.toggle calls
- Delete custom theme toggle buttons

**Only exception:** `useAppSetup()` hook removes dark mode on non-app routes (this is handled by skateboard-ui, not your code).


## Complete Component Example

**Before** (old pattern):
```javascript
import { useState, useEffect } from 'react';
import { getCookie, getBackendURL } from '@stevederico/skateboard-ui/Utilities';

function EventsView() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    fetch(`${getBackendURL()}/events`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getCookie('token')}`
      }
    })
    .then(res => res.json())
    .then(setEvents)
    .catch(console.error);
  }, []);

  const createEvent = async (data) => {
    await fetch(`${getBackendURL()}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getCookie('token')}`
      },
      body: JSON.stringify(data)
    });
  };

  return <div>{/* UI */}</div>;
}
```

**After** (0.9.8+ using exported utilities):
```javascript
import { useState, useEffect } from 'react';
import { getBackendURL, getCSRFToken } from '@stevederico/skateboard-ui/Utilities';

function EventsView() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    fetch(`${getBackendURL()}/events`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    .then(res => {
      if (res.status === 401) {
        window.location.href = '/signout';
        throw new Error('Unauthorized');
      }
      return res.json();
    })
    .then(setEvents)
    .catch(console.error);
  }, []);

  const createEvent = async (data) => {
    const csrfToken = getCSRFToken(); // Imported from skateboard-ui
    await fetch(`${getBackendURL()}/events`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken && { 'X-CSRF-Token': csrfToken })
      },
      body: JSON.stringify(data)
    });
  };

  return <div>{/* UI */}</div>;
}
```

## Migration Checklist

### Frontend
- [ ] Update to skateboard-ui 0.9.8
- [ ] **Import ProtectedRoute** from skateboard-ui (remove custom definition)
- [ ] **Import utilities** (isAuthenticated, getCSRFToken, getAppKey, useAppSetup)
- [ ] **Import ThemeToggle** from skateboard-ui (remove ALL custom dark mode code)
- [ ] **Update styles.css** to match skateboard 0.9.4 template
- [ ] **Verify `@plugin 'tailwindcss-animate'` is present** in styles.css
- [ ] **Remove commented-out code** from styles.css
- [ ] **Add `/signout` route** with SignOutView from skateboard-ui
- [ ] Update component imports (StripeView → PaymentView)
- [ ] Add `credentials: 'include'` to all fetch calls
- [ ] Remove Authorization headers from all requests
- [ ] Use imported `getCSRFToken()` for POST/PUT/DELETE requests
- [ ] **Remove duplicate getCSRFToken()** functions from all component files
- [ ] **Remove unused utility imports** from main.jsx
- [ ] Update context.jsx to standard pattern (CLEAR_USER removes CSRF)
- [ ] Simplify main.jsx using ProtectedRoute and useAppSetup
- [ ] **Update index.html body style** (remove height/overflow restrictions)
- [ ] **Delete all custom theme detection/toggle code**
- [ ] Test authentication flows

### Components to Update
Search your codebase for these patterns and update:

```bash
# Find files using old auth pattern
grep -r "getCookie('token')" src/
grep -r "Authorization.*Bearer" src/
grep -r "localStorage.getItem('token')" src/

# Find renamed components
grep -r "import.*StripeView" src/
```

Common files to check:
- **main.jsx / App.jsx** - Add SignOutView route, update component imports, simplify auth logic
- **context.jsx** - Remove redundant cookie/CSRF clearing (SignOutView handles it)
- Any component fetching data
- CreateSheet/AddSheet components
- EditSheet components
- DeleteSheet components
- Profile/Settings components
- Custom API utility functions

## Testing

### 1. Test Sign In Flow
1. Clear all cookies and localStorage
2. Sign in
3. Verify CSRF token in localStorage: `yourapp_csrf`
4. Verify httpOnly cookie in DevTools > Application > Cookies
5. Check you can access protected routes

### 2. Test API Calls
1. Open DevTools > Network
2. Make GET request - verify `credentials: include` sends cookies
3. Make POST request - verify `X-CSRF-Token` header present
4. Verify 200 responses

### 3. Test Sign Out
1. Click sign out button
2. Verify redirected to /signin
3. Verify cookies cleared
4. Verify can't access protected routes

### 4. Test Migration Path
1. Sign in with old app version (if testing migration)
2. Deploy new version
3. Verify old token automatically cleared
4. Verify redirected to sign in
5. Sign in successfully

## Error Handling

### 401 Unauthorized
```javascript
.then(response => {
  if (response.status === 401) {
    window.location.href = '/signout';
    throw new Error('Unauthorized - Redirecting to Sign Out');
  }
  if (!response.ok) {
    throw new Error(`Server responded with status: ${response.status}`);
  }
  return response.json();
})
```

### CSRF Token Missing
```javascript
const csrfToken = getCSRFToken();
if (!csrfToken) {
  console.error('CSRF token not found - user may need to sign in');
  window.location.href = '/signin';
  return;
}
```

## Backend Implementation Notes

### /signout Endpoint Must NOT Require Authentication

**CRITICAL**: The `/signout` endpoint must be accessible without authentication to handle expired/invalid tokens gracefully.

**Incorrect** (causes infinite loops):
```javascript
app.post("/signout", authMiddleware, async (req, res) => {
  // Users with invalid tokens can't access this!
});
```

**Correct** (works for all users):
```javascript
app.post("/signout", async (req, res) => {
  // Try to get userID for cleanup, but don't require it
  let userID = null;
  try {
    const token = req.cookies?.token;
    if (token && JWT_SECRET) {
      const keyData = new TextEncoder().encode(JWT_SECRET);
      const cryptoKey = await crypto.subtle.importKey("raw", keyData,
        { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
      const payload = await verify(token, cryptoKey, { algorithms: ["HS256"] });
      userID = payload.userID;
    }
  } catch (e) {
    // Token invalid - that's fine, we'll clear it anyway
    logger.info("Signout with invalid token", { error: e.message });
  }

  // Clear CSRF token if we have userID
  if (userID) {
    csrfTokenStore.delete(userID);
  }

  // Always clear the cookie
  res.cookie('token', '', {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    path: '/',
    expires: new Date(0)
  });

  res.json({ message: "Signed out successfully" });
});
```

The skateboard backend implements this correctly.

## Version Requirements

**IMPORTANT**: Use skateboard-ui 0.9.6 or higher for httpOnly cookie support.

skateboard-ui 0.9.5 had a bug where SignInView and SignUpView were missing `credentials: 'include'`, which prevented httpOnly cookies from working. **This was fixed in 0.9.6**.

If you're on 0.9.5, upgrade:
```bash
deno install npm:@stevederico/skateboard-ui@0.9.6
deno install
```

## Troubleshooting

### "Cannot GET /signout" or "SignOutView not found"
**Cause**: Missing `/signout` route in your routing configuration
**Fix**: Import SignOutView from skateboard-ui and add route (see section 5 above)
```javascript
import SignOutView from '@stevederico/skateboard-ui/SignOutView';
<Route path="/signout" element={<SignOutView />} />
```

### "/signout returns 401 Unauthorized"
**Cause**: Backend `/signout` endpoint requires authentication (incorrect implementation)
**Fix**: Remove `authMiddleware` from `/signout` endpoint. See "Backend Implementation Notes" above.

### "StripeView is not exported from skateboard-ui"
**Cause**: Component was renamed in 0.9.5
**Fix**: Update import:
```javascript
// Change this:
import StripeView from '@stevederico/skateboard-ui/StripeView';
// To this:
import PaymentView from '@stevederico/skateboard-ui/PaymentView';
```

### "CSRF token validation failed"
**Cause**: CSRF token not being sent or doesn't match cookie
**Fix**:
- Verify `credentials: 'include'` on fetch
- Check X-CSRF-Token header is present
- Ensure localStorage has correct CSRF token key

### "Token verification failed"
**Cause**: Old JWT tokens from previous version
**Fix**: Backend automatically clears these - users just need to sign in again

### Cookies not being sent
**Cause**: Missing `credentials: 'include'`
**Fix**: Add to all fetch calls

### Can't read token in JavaScript
**Cause**: Tokens now in httpOnly cookies (this is correct!)
**Fix**: Don't try to read JWT - use `isAuthenticated()` instead

### CORS errors
**Cause**: Backend not configured for credentials
**Fix**: Verify backend config.json has correct CORS settings with `credentials: true`

### Infinite redirect loop between /app and /signin
**Cause**: `isAuthenticated()` not finding CSRF token in localStorage
**Fix**:
- Check CSRF token key matches your app name
- Verify user successfully signed in and CSRF token was stored
- Clear localStorage and sign in again

### "Cannot read properties of undefined (reading 'title')" on LandingView
**Error:**
```
Uncaught TypeError: Cannot read properties of undefined (reading 'title')
    at LandingView (LandingView.jsx:255:128)
```

**Cause**: Missing required fields in constants.json for skateboard-ui 0.9.8 LandingView

**Fix**: Ensure your `src/constants.json` has the complete `features` object structure:

```json
{
  "appName": "Your App",
  "appIcon": "icon-name",
  "tagline": "Your tagline",
  "cta": "Get Started",
  "features": {
    "title": "Everything You Need",
    "items": [
      {
        "icon": "🔐",
        "title": "Authentication",
        "description": "Complete user management with JWT tokens and secure sessions"
      },
      {
        "icon": "💳",
        "title": "Stripe Payments",
        "description": "Ready-to-use checkout flows and subscription management"
      },
      {
        "icon": "🎨",
        "title": "Beautiful UI",
        "description": "50+ Shadcn components with dark mode support"
      }
    ]
  },
  "backendURL": "http://localhost:8000",
  "devBackendURL": "http://localhost:8000",
  "pages": [
    {
      "title": "Home",
      "url": "home",
      "icon": "house"
    }
  ],
  "stripeProducts": [{
    "price": "$5.00",
    "title": "Unlimited",
    "interval": "monthly",
    "lookup_key": "my_lookup_key",
    "features": [
      "Unlimited Todos",
      "Unlimited Messages",
      "All Premium Features",
      "Priority Customer Support",
      "Cancel Anytime"
    ]
  }],
  "companyName": "Company Inc",
  "companyWebsite": "company.com",
  "companyEmail": "support@company.com",
  "termsOfService": "...",
  "privacyPolicy": "...",
  "EULA": "..."
}
```

**Required fields for LandingView:**
- `features` (object) - Feature section configuration
  - `features.title` (string) - Section heading (e.g., "Everything You Need")
  - `features.items` (array) - List of features to display
    - `icon` (string) - Emoji or icon identifier
    - `title` (string) - Feature name
    - `description` (string) - Feature description
- `cta` (string) - Call-to-action button text
- `appName` (string) - Application name
- `appIcon` (string) - Icon identifier for header
- `tagline` (string) - Hero section tagline

**Note**: This error occurs at LandingView line 255 where it accesses `constants.features.title`. Ensure all nested properties exist to prevent undefined access errors.

### LandingView Scrolling Issues
**Cause**: LandingView is designed as a full landing page with multiple sections (Hero, Features, Pricing, CTA, Footer)
**Expected Behavior**: The page should scroll vertically to show all sections. This is normal for a landing page.

**Most Common Issue**: Check your `index.html` for `overflow: hidden` on the `<body>` tag:

```html
<!-- ❌ INCORRECT - Prevents scrolling -->
<body style="height: 100%; overflow: hidden;">
  <div id="root"></div>
</body>

<!-- ✅ CORRECT - Allows scrolling -->
<body style="overscroll-behavior: none;">
  <div id="root"></div>
</body>
```

**Why this happens**: Many apps add `overflow: hidden` to prevent rubber-band scrolling in mobile wrappers or for fixed-height app views. However, this completely prevents scrolling on LandingView.

**Fix**: Remove `overflow: hidden` and `height: 100%` from the body tag. Keep `overscroll-behavior: none` if you need to prevent rubber-band scrolling.

Other things to check if scrolling still doesn't work:
1. No `overflow-hidden` class on `<html>` or `<body>` elements
2. No parent containers with fixed heights that prevent scrolling
3. The LandingView uses `min-h-screen` which is correct for a scrollable landing page
4. Check browser console for any JavaScript errors that might be preventing scroll

If you want a simplified single-screen landing page, consider creating a custom landing view or using `LandingViewSimple` (if available in your skateboard-ui version).

### SignInView/SignUpView Background Color Mismatch
**Cause**: Body background color doesn't match the component's white background, creating a visible off-color bar or area
**Symptom**: Light gray/off-white bar visible above or around the SignInView/SignUpView form

**Fix**: Update your `src/assets/styles.css` to use pure white background:

```css
:root {
  --background: oklch(1 0 0);  /* Pure white */
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);  /* Pure white */
  --card-foreground: oklch(0.145 0 0);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  html {
    @apply bg-background;
    margin: 0;
    padding: 0;
  }
  body {
    @apply bg-background text-foreground;
    margin: 0;
    padding: 0;
  }
}
```

**Why this happens**: SignInView and SignUpView use `bg-white` (pure white), but if your body background is set to a slightly gray color like `oklch(0.985 0 0)`, the mismatch creates a visible bar. Additionally, default browser margins on `html` and `body` can create gaps.

**What changed**:
- Changed `--background` from `oklch(0.985 0 0)` to `oklch(1 0 0)` (pure white)
- Changed `--card` from `oklch(0.985 0 0)` to `oklch(1 0 0)` (pure white)
- Added explicit `margin: 0` and `padding: 0` to `html` and `body` elements
- Added `bg-background` to `html` element to ensure consistent coloring

## Security Notes

1. **Never log CSRF tokens** - Keep them out of console.log, error logs
2. **Never send tokens in URLs** - Use headers only
3. **Use HTTPS in production** - Required for secure cookies
4. **Set sameSite: 'strict'** - For production (if same domain)
5. **Regular token rotation** - Consider implementing refresh tokens

## Common Patterns

### Reusable Fetch Wrapper

```javascript
import { getBackendURL } from '@stevederico/skateboard-ui/Utilities';
import constants from '@/constants.json';

function getCSRFToken() {
  const appName = constants.appName || 'your-app-name';
  const csrfKey = `${appName.toLowerCase().replace(/\s+/g, '-')}_csrf`;
  return localStorage.getItem(csrfKey);
}

export async function apiRequest(endpoint, options = {}) {
  const csrfToken = getCSRFToken();
  const needsCSRF = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(
    (options.method || 'GET').toUpperCase()
  );

  const response = await fetch(`${getBackendURL()}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(needsCSRF && csrfToken && { 'X-CSRF-Token': csrfToken }),
      ...options.headers
    }
  });

  if (response.status === 401) {
    window.location.href = '/signout';
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

// Usage:
const events = await apiRequest('/events');
const newEvent = await apiRequest('/events', {
  method: 'POST',
  body: JSON.stringify(data)
});
```

## Version Compatibility

| skateboard-ui Version | Status |
|----------------------|--------|
| 0.9.8 | ✅ **Recommended** (Latest) |
| 0.9.7 | ✅ Compatible |
| 0.9.6 | ✅ Compatible |
| 0.9.5 | ⚠️  Bug with credentials - upgrade to 0.9.6+ |
| 0.8.x or older | ❌ Use this migration guide to upgrade |

**Reference Template:**
[github.com/stevederico/skateboard](https://github.com/stevederico/skateboard) v0.9.4 uses skateboard-ui 0.9.8 and demonstrates the modern zero-duplication pattern.

## Support

For issues or questions:
- GitHub Issues: https://github.com/stevederico/skateboard-ui
- Check browser console for errors
- Verify network tab shows correct headers and cookies

## Summary

This migration brings **any project** (no matter how old) into alignment with skateboard 0.9.4 boilerplate while preserving your unique application code.

### Why Migrate?

**Consistency**: All apps use the same boilerplate structure from skateboard 0.9.4
**Security**: httpOnly cookies + CSRF protection (prevents XSS and CSRF attacks)
**Maintainability**: Zero code duplication - all utilities imported from skateboard-ui
**Simplicity**: Standard patterns make onboarding and debugging easier

### What This Achieves:

**Structure (matches skateboard 0.9.4 exactly):**
- ✅ Import `ProtectedRoute` - no custom definition
- ✅ Import `isAuthenticated()`, `getCSRFToken()`, `getAppKey()` - no duplication
- ✅ Use `ThemeToggle` - no custom dark mode code
- ✅ Use `useAppSetup()` hook - standard setup
- ✅ Standard `context.jsx` - minimal boilerplate
- ✅ Clean `main.jsx` - follows template exactly
- ✅ Modern `styles.css` - consistent colors

**Your Code (stays intact):**
- ✅ Custom components and views
- ✅ Business logic and features
- ✅ API integrations
- ✅ App-specific functionality

### Migration Steps:
1. Install skateboard-ui 0.9.8
2. **Replace boilerplate** (main.jsx, context.jsx, styles.css) with skateboard 0.9.4 patterns
3. **Import all utilities** from skateboard-ui (remove duplicates)
4. **Keep your custom components** (HomeView, ProfileView, etc.)
5. Add `credentials: 'include'` to all fetch calls
6. Use imported `getCSRFToken()` for mutations
7. Test thoroughly

**Golden Rule**: If skateboard 0.9.4 has it, your project should match it exactly (for boilerplate). Your custom code stays untouched.

**Reference Template:** [github.com/stevederico/skateboard](https://github.com/stevederico/skateboard) v0.9.4

Follow this guide step-by-step and test thoroughly before deploying.

** proxy and instant signout issues **

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const customLoggerPlugin = () => {
  return {
    name: 'custom-logger',
    configureServer(server) {
      const originalPrint = server.printUrls;
      server.printUrls = () => {
        console.log(`🖥️  React is running on http://localhost:${server.config.server.port || 5173}`);
      };
    }
  };
};

const htmlReplacePlugin = () => {
  return {
    name: 'html-replace',
    transformIndexHtml(html) {
      const constants = JSON.parse(readFileSync('src/constants.json', 'utf8'));
      
      return html
        .replace(/{{APP_NAME}}/g, constants.appName)
        .replace(/{{TAGLINE}}/g, constants.tagline)
        .replace(/{{COMPANY_WEBSITE}}/g, constants.companyWebsite);
    }
  };
};

const dynamicRobotsPlugin = () => {
  return {
    name: 'dynamic-robots',
    generateBundle() {
      const constants = JSON.parse(readFileSync('src/constants.json', 'utf8'));
      const website = constants.companyWebsite.startsWith('http') 
        ? constants.companyWebsite 
        : `https://${constants.companyWebsite}`;
      
      const robotsContent = `User-agent: Googlebot
Disallow: /app/
Disallow: /console/
Disallow: /signin/
Disallow: /signup/

User-agent: Bingbot
Disallow: /app/
Disallow: /console/
Disallow: /signin/
Disallow: /signup/

User-agent: Applebot
Disallow: /app/
Disallow: /console/
Disallow: /signin/
Disallow: /signup/

User-agent: facebookexternalhit
Disallow: /app/
Disallow: /console/
Disallow: /signin/
Disallow: /signup/

User-agent: Facebot
Disallow: /app/
Disallow: /console/
Disallow: /signin/
Disallow: /signup/

User-agent: Twitterbot
Disallow: /app/
Disallow: /console/
Disallow: /signin/
Disallow: /signup/

User-agent: *
Disallow: /

Sitemap: ${website}/sitemap.xml
`;

      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: robotsContent
      });
    }
  };
};

const dynamicSitemapPlugin = () => {
  return {
    name: 'dynamic-sitemap',
    generateBundle() {
      const constants = JSON.parse(readFileSync('src/constants.json', 'utf8'));
      const website = constants.companyWebsite.startsWith('http') 
        ? constants.companyWebsite 
        : `https://${constants.companyWebsite}`;
      
      const currentDate = new Date().toISOString().split('T')[0];
      
      const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${website}/</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${website}/terms</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${website}/privacy</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${website}/subs</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${website}/eula</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>`;

      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: sitemapContent
      });
    }
  };
};

const dynamicManifestPlugin = () => {
  return {
    name: 'dynamic-manifest',
    generateBundle() {
      const constants = JSON.parse(readFileSync('src/constants.json', 'utf8'));
      
      const manifestContent = {
        short_name: constants.appName,
        name: constants.appName,
        description: constants.tagline,
        icons: [
          {
            src: "/icons/icon.svg",
            sizes: "192x192",
            type: "image/svg+xml"
          }
        ],
        start_url: "./app",
        display: "standalone",
        theme_color: "#000000",
        background_color: "#ffffff"
      };

      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(manifestContent, null, 2)
      });
    }
  };
};

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
  esbuild: {
    drop: []
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@package': path.resolve(__dirname, 'package.json'),
      '@root': path.resolve(__dirname),
      'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime.js'),
    }
  },
  optimizeDeps: {
    include: ['react-dom', '@radix-ui/react-slot'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  server: {
    host: 'localhost',
    open: false,
    port: 5173,
    strictPort: false,
    hmr: {
      port: 5173,
      overlay: false,
    },
    watch: {
      usePolling: false,
      ignored: ['**/node_modules/**', '**/.git/**']
    },
  },
  logLevel: 'error'
})
