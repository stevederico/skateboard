# Migration Guide

## Current Version: 2.4.x

### Quick Upgrade

```bash
deno install npm:@stevederico/skateboard-ui@latest
deno install
```

### What's New in 1.1.x

- **Hono** replaces Express (backend)
- **Deno 2.3+** runtime
- All API routes prefixed with `/api`
- Apps own their `vite.config.js` directly
- New env vars: `CORS_ORIGINS`, `FRONTEND_URL`

---

## From 1.0.x to 1.1.x

### 1. Update Dependencies

```bash
deno install npm:@stevederico/skateboard-ui@latest
```

### 2. Copy vite.config.js

Apps now own their Vite configuration. Copy from the [reference implementation](https://github.com/stevederico/skateboard/blob/master/vite.config.js).

**Old (1.0.x):**
```javascript
import { getSkateboardViteConfig } from '@stevederico/skateboard-ui/Utilities';
export default getSkateboardViteConfig();
```

**New (1.1.x):** Full config in your app (see reference)

### 3. Add Environment Variables

```bash
CORS_ORIGINS=https://yourapp.com
FRONTEND_URL=https://yourapp.com
```

---

## From 0.9.x to 1.0.x (Application Shell Architecture)

This is the major migration that reduces boilerplate by 95%.

### Benefits

- **Before**: ~550 lines of boilerplate per app
- **After**: ~26 lines total
- Update skateboard-ui once, all apps inherit improvements

### 1. Update Dependencies

```json
{
  "dependencies": {
    "@stevederico/skateboard-ui": "^2.9.3",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-router-dom": "^7.9.0"
  }
}
```

### 2. Simplify main.jsx

**Before (82 lines):**
```javascript
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from '@stevederico/skateboard-ui/Layout';
// ... many more imports and manual routing
```

**After (16 lines):**
```javascript
import './assets/styles.css';
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import constants from './constants.json';
import HomeView from './components/HomeView.jsx';

const appRoutes = [
  { path: 'home', element: <HomeView /> }
];

createSkateboardApp({ constants, appRoutes, defaultRoute: 'home' });
```

### 3. Delete context.jsx

Import from skateboard-ui instead:

```javascript
import { getState } from '@stevederico/skateboard-ui/Context';
```

### 4. Simplify styles.css

**Before (182 lines):** Full theme definition

**After (7 lines):**
```css
@import "@stevederico/skateboard-ui/styles.css";

@source '../../node_modules/@stevederico/skateboard-ui';

@theme {
  --color-app: var(--color-purple-500);
}
```

### 5. Update Component Imports

```javascript
// Old
import { getState } from '../context.jsx';

// New
import { getState } from '@stevederico/skateboard-ui/Context';
```

### 6. Use DynamicIcon Instead of lucide-react

```javascript
// Old
import { Trash2 } from 'lucide-react';
<Trash2 size={16} />

// New
import DynamicIcon from '@stevederico/skateboard-ui/DynamicIcon';
<DynamicIcon name="trash-2" size={16} />
```

---

## From Pre-0.9.x (Legacy Migration)

For apps using old authentication patterns.

### Key Changes

1. **httpOnly Cookies**: JWT now stored in secure cookies (not localStorage)
2. **CSRF Protection**: Required for all mutations
3. **Credentials Include**: All fetch calls need `credentials: 'include'`

### Update Fetch Calls

**GET Requests:**
```javascript
fetch(`${getBackendURL()}/events`, {
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' }
})
```

**POST/PUT/DELETE Requests:**
```javascript
import { getCSRFToken } from '@stevederico/skateboard-ui/Utilities';

const csrfToken = getCSRFToken();
fetch(`${getBackendURL()}/events`, {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    ...(csrfToken && { 'X-CSRF-Token': csrfToken })
  },
  body: JSON.stringify(data)
})
```

### Add SignOut Route

```javascript
import SignOutView from '@stevederico/skateboard-ui/SignOutView';

<Route path="/signout" element={<SignOutView />} />
```

### Remove Authorization Headers

No longer needed - cookies are sent automatically:

```javascript
// Remove this
headers: { 'Authorization': `Bearer ${getCookie('token')}` }
```

---

## Troubleshooting

### "Cannot find module '@stevederico/skateboard-ui/Context'"
Update to skateboard-ui 1.0.0+

### "getSkateboardViteConfig is not a function"
Update to 1.0.0+ or copy vite.config.js for 1.1.0+

### Routes not working
Ensure appRoutes paths don't have leading slash:
```javascript
{ path: 'home', element: <HomeView /> }  // correct
{ path: '/home', element: <HomeView /> } // wrong
```

### CSRF token validation failed
- Verify `credentials: 'include'` on fetch
- Check X-CSRF-Token header is present

### 401 on all requests
- Check httpOnly cookie is being sent
- Verify CORS_ORIGINS includes your frontend

---

## Version Compatibility

| Version | Status | Notes |
|---------|--------|-------|
| 2.4.x | Current | Latest features, skateboard-ui 2.9.3 |
| 2.3.x | Supported | Added constants options |
| 1.x | Upgrade | Use this guide |
| 0.9.x | Deprecated | Upgrade to 1.x first |

## Reference

- [skateboard repo](https://github.com/stevederico/skateboard) - Reference implementation
- [ARCHITECTURE.md](ARCHITECTURE.md) - Application Shell deep dive
