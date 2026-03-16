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

**Testing:**
```bash
npm run test           # Run all tests (vitest run)
npm run test:watch     # Watch mode for development
```

## Code Standards

### Documentation Requirements

**CRITICAL: Documentation must always match code.**

**All exported/public functions, classes, and non-obvious constants must have JSDoc comments (`/** */`).**

**Required:**
- All exported/public functions and classes
- Parameters, return types, and thrown errors/exceptions
- Non-obvious constants and configuration objects
- Complex logic via inline comments explaining *why*, not *what*

**Exempt:**
- Trivial getters/setters where the name is self-documenting
- One-liner utility functions with obvious intent (e.g., `const isEven = (n) => n % 2 === 0`)
- Private/internal helpers under ~3 lines where intent is clear from context
- Third-party and imported code (e.g., shadcn components, library wrappers)

When making ANY code changes, you MUST update:
- JSDoc comments on modified functions/classes/components
- Inline comments explaining complex logic
- README.md if user-facing behavior changes
- CLAUDE.md if architecture/patterns change
- API docs if endpoints change
- CHANGELOG.md for all changes (see commit protocol)

**Before committing:**
1. Review all modified functions — do JSDoc comments match current signatures and behavior?
2. Check that parameter names, types, and descriptions are accurate
3. Remove doc comments for deleted functions — don't leave orphaned docs
4. Verify examples in docs still work with changes

**Out-of-date documentation is worse than no documentation.**

### Changelog Formatting

- `- item` (dash prefix) = incomplete
- `item` (no dash, no space) = completed

### Naming Conventions

- Functions: `camelCase` verbs (`fetchUser`, `handleClick`)
- Components: `PascalCase` (`HomeView`, `DealCard`)
- Constants: `UPPER_SNAKE_CASE` for true constants, `camelCase` for config objects
- Files: components as `PascalCase.jsx`, everything else `camelCase.js`
- Boolean variables prefixed with `is`, `has`, `should` (`isLoading`, `hasAccess`)

### Function Design

- Max ~50 lines per function — if longer, break it up
- Single responsibility — one function does one thing
- Early returns over nested conditionals
- No magic numbers — extract to named constants

### Code Organization

- Imports ordered: external packages → internal modules → relative paths
- Group related functions together in a file
- Keep components focused — if a component file exceeds ~150 lines, consider splitting

### JavaScript Style

- Prefer `const` over `let` — use `let` only when reassigning
- Prefer `async`/`await` over `.then()` chains
- Prefer destructuring: `const { id } = user` over `const id = user.id`
- Prefer array methods (`map`, `filter`, `reduce`) over `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) liberally
- Use template literals over string concatenation
- Use object shorthand: `{ foo }` over `{ foo: foo }`
- Use default parameters over manual checks
- Always use ES modules — never use `require()`
- Always use javascript — never use TypeScript or `@types` packages

### Prohibited Tools & Practices

- Never use TypeScript or `@types` packages
- Never use dotenv — manually load `.env` file
- Never use `require()` — ES modules only
- Never use mongoose — use the `mongodb` npm package
- Never use axios, got, or similar — native `fetch` only
- Never use PostCSS, autoprefixer, or `tailwind.config.js`
- Never use ESLint or the `globals` package
- Minimize external packages — use built-in/native solutions when possible

## Error Handling (MANDATORY)

**Error handling is a first-class feature, not an afterthought. Every error must be surfaced to the user in a clear, actionable way.**

### Core Rules

- Always handle errors at system boundaries (API calls, user input, DB queries)
- Never silently swallow errors — at minimum `console.error`
- Use try/catch for async operations that can fail
- Return meaningful error messages to the caller

### User-Facing Error Display

- **Every error must be visible to the user** — no silent failures
- Use toast notifications (`toast.error()`) for transient errors (network failures, API errors, validation)
- Use inline error states for form/input errors — show the error next to the field
- Use empty states with error messaging for failed data fetches — never show a blank screen
- **Error messages must be human-readable** — never show raw error codes, stack traces, or technical jargon. Translate API errors into plain language
- Include a recovery action when possible — "Try again", "Check your connection", "Contact support"

### Loading & Progress States

- Show loading indicators for any operation that takes >200ms
- For long operations (batch processing, API calls), show progress with a label
- If an operation can be cancelled, provide a cancel button
- Never leave the UI in a "loading" state after an error — always reset to an actionable state

### Graceful Degradation

- If a non-critical feature fails, the rest of the app must still work
- Partial success is better than total failure — if 15 of 20 items succeed, show the 15 and mark 5 as failed
- Cache previous successful results when possible so users don't lose work on retry

## External API Safety (MANDATORY)

**Every call to an external/third-party API must have rate limiting and backoff. No exceptions.**

- **Respect rate limits** — before writing code that calls an external API, check the API's rate limit docs and design within them
- **Exponential backoff on 429/5xx** — retry with increasing delays (1s → 2s → 4s → 8s), max 3-5 retries, then fail gracefully
- **Never loop API calls without throttling** — if calling an API N times, add delays between calls
- **Never call a batch endpoint in a loop** — if an API has a batch/bulk endpoint, call it ONCE, not once per item
- **Circuit breaker** — after 3 consecutive failures from an external API, stop calling it and surface the error to the user
- **Log rate limit headers** — if the API returns `X-RateLimit-Remaining` or similar, log it and stop before hitting zero

## React Rules

- Prefer functional components, never class components
- Colocate state with the component that owns it
- Avoid prop drilling beyond 2 levels — use context
- Event handlers prefixed with `handle` (`handleSubmit`, `handleDelete`)
- Never use `alert()`, `confirm()`, or `prompt()` — use shadcn Dialog/AlertDialog
- Max 3 levels of component nesting — flat is better than deep
- Every list/grid view needs an empty state (icon + message + CTA)
- Every data-fetching view handles 3 states: loading, error, data

## Styling & UI

- Always use tailwindcss v4+ with @tailwindcss/vite plugin
- Style using utility classes on elements, not central CSS
- Support dark mode with bg-background, bg-accent — never manual `dark:` overrides (`dark:bg-gray-800`), semantic tokens handle it
- Use semantic color tokens (`bg-background`, `text-foreground`, `border-border`) — never raw colors (`bg-white`, `text-gray-500`)
- Use `gap-*` between flex/grid children — never `space-x-*` / `space-y-*`, never margin between siblings for spacing
- Limit palette to 3-5 semantic colors per view — don't rainbow
- Max 2 font families — 1 heading + 1 body (default: Geist Sans + Geist Mono)
- Use `rounded-md` / `rounded-lg` from design tokens — never arbitrary `rounded-[12px]`
- Prefer Tailwind scale values (`p-4`, `gap-6`) — never arbitrary values (`p-[16px]`, `gap-[24px]`)
- Use `size-*` for square elements — never `w-10 h-10` when `size-10` works
- Use `text-balance` or `text-pretty` on headings and titles
- Use `cn()` for conditional class composition — never template literal ternaries
- Design mobile-first — use `min-width` breakpoints (`sm:`, `md:`, `lg:`), enhance upward
- Never use `transition-all` — be specific (`transition-colors`, `transition-opacity`, `transition-transform`)
- Never generate abstract decorative shapes (gradient circles, blurry blobs, decorative SVGs)

### Icons

- Default icon library: Lucide React (`lucide-react`)
- Never use emoji as UI icons — use proper icon components (exception: `constants.json` feature icons where the shell renders them as text)
- Icon-only buttons must have `aria-label`
- Standard sizes: 16px inline, 18px buttons, 24px cards, 48px empty states

### Component Selection — use the right component:

| Need | Use | Not |
|------|-----|-----|
| Action | `<Button>` | `<button>` |
| Text input | `<Input>` + `<Label>` | `<input>` |
| Modal | `<Dialog>` | custom div |
| Confirmation | `<AlertDialog>` | `confirm()` |
| Toast | `toast()` | `alert()` |
| Loading | `<Spinner>` / `<Skeleton>` | custom div |
| Empty state | `<Empty>` | conditional text |
| Side panel | `<Sheet>` | absolute div |

### Design Configuration

When a project uses `constants.json`, include a `design` block:
```json
"design": {
  "baseColor": "neutral",
  "radius": "medium",
  "font": "geist",
  "iconLibrary": "lucide"
}
```

## Accessibility (MANDATORY)

**Every UI element must be accessible. No exceptions, no shortcuts, no "we'll add it later."**

### Required on Every Element

- **All interactive elements** must have a visible text label OR an `aria-label` / `aria-labelledby` attribute
- **All images** must have meaningful `alt` text — use `alt=""` only for purely decorative images
- **All form inputs** must be associated with a `<Label>` via `htmlFor`/`id` pairing or by nesting
- **All icon-only buttons** must have `aria-label` describing the action (e.g., `aria-label="Close dialog"`, not `aria-label="X"`)
- **All custom interactive components** (divs/spans acting as buttons) must have `role`, `tabIndex`, and keyboard event handlers

### Semantic HTML

- Use semantic elements over generic divs: `<nav>`, `<main>`, `<section>`, `<article>`, `<header>`, `<footer>`, `<aside>`
- Every page must have exactly one `<main>` landmark
- Use heading hierarchy correctly (`h1` → `h2` → `h3`) — never skip levels for styling
- Use `<ul>`/`<ol>` for lists, `<table>` for tabular data — not divs styled to look like them

### ARIA Attributes

- `aria-label` for elements whose purpose isn't clear from visible text
- `aria-live="polite"` for dynamic content updates (toasts, status messages, loading states)
- `aria-expanded`, `aria-haspopup`, `aria-controls` on disclosure/dropdown triggers
- `aria-current="page"` on active navigation links
- `aria-describedby` to associate help text or error messages with form fields
- `role="status"` or `role="alert"` for status messages and errors
- Never use `aria-hidden="true"` on focusable elements

### Keyboard Navigation

- All interactive elements must be reachable via Tab key in logical order
- Escape must close modals, dropdowns, and popovers
- Arrow keys must navigate within composite widgets (tabs, menus, radio groups)
- Focus must be trapped inside open modals and restored to the trigger on close
- Visible focus indicators must never be removed (`outline-none` without a replacement is prohibited)

### Color, Contrast & Touch

- Text must meet WCAG 2.1 AA contrast ratios (4.5:1 normal text, 3:1 large text)
- Never convey information through color alone — pair with icons, text, or patterns
- Focus indicators must have minimum 3:1 contrast against adjacent colors
- Touch targets: minimum 44px on mobile — expand hit areas with padding if needed
- Honor `prefers-reduced-motion` — wrap animations in `motion-safe:` or use `@media (prefers-reduced-motion: reduce)`

## Security

- Never hard-code connection strings (MongoDB, Postgres, etc.)
- Use environment variables for secrets
- Keep credentials out of logs and output

## Testing Standards

**Every new feature must ship with tests. No tests, no merge.**

### Test Runner

- **Vitest** is the standard test runner — never use Jest, Mocha, or Jasmine
- Config lives in `vite.config.js` under `test` key
- Use `npm run test` for CI; `npm run test:watch` for development

### What to Test

- **Always test:** Business logic, data transformations, API route handlers, utility/helper functions, state management logic, auth flows, form validation, error handling paths, edge cases on public functions
- **Skip testing:** Trivial component rendering with no logic, third-party library wrappers, static configuration objects, pure CSS/layout

### Test File Conventions

- Test files live next to the code they test: `fetchUser.js` → `fetchUser.test.js`
- Component tests: `HomeView.jsx` → `HomeView.test.jsx`
- Name test files with `.test.js` / `.test.jsx` suffix — never `.spec.js`
- One test file per module

### Test Structure

```javascript
import { describe, it, expect } from 'vitest';

describe('fetchUser', () => {
  it('returns user object for valid id', async () => {
    const user = await fetchUser('123');
    expect(user).toHaveProperty('id', '123');
  });

  it('throws on non-existent id', async () => {
    await expect(fetchUser('bad')).rejects.toThrow('Not found');
  });
});
```

**Rules:**
- `describe` block per function/component
- `it` blocks describe behavior, not implementation
- One assertion per `it` block when possible
- Use `beforeEach`/`afterEach` for setup/teardown — never share mutable state across tests
- Prefer real implementations over mocks — mock only external boundaries (network, database, filesystem)
- Mock at the boundary, not the internals — mock `fetch`, not the function that calls `fetch`
- Reset mocks in `afterEach`
- Never mock the module under test

### When Modifying Existing Code

1. Run the existing test suite first — confirm baseline is green
2. If changing a function's behavior, update its tests to match
3. If fixing a bug, write a failing test that reproduces the bug *before* fixing it
4. If refactoring, tests should pass without modification

### Before Committing

1. `npm run test` passes with zero failures
2. New functions have corresponding test files
3. Modified functions have updated tests
4. No `.only` or `.skip` left in test files

## Git Standards

### Branching

- Default branch: `master`
- Branch naming: `feature/short-description`, `fix/short-description`, `chore/short-description`
- One PR per logical change

### Commits

- Commit messages in imperative mood ("Add feature" not "Added feature")
- One logical change per commit

### Commit Process

1. **Update CHANGELOG.md** — never remove anything. To-do list (dash-prefixed) stays at top. Insert new version notes below to-do section, above previous versions. List changes with 2-space indent, no dashes, 3 words or less, present tense.
2. **Update package.json** — bump version to match CHANGELOG (semver)
3. **Stage files** — only stage files you directly modified (no `git add .`)
4. **Commit** — message starts with version number, followed by descriptive summary
5. **Push and tag** — `git push origin master && git tag 0.x.x && git push origin 0.x.x`

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

### Frontend Stack
- React, Vite, react-router-dom (latest versions)
- JavaScript only, ES modules only
- Tailwind CSS v4+ with @tailwindcss/vite plugin

### Backend Stack
- Runtime: Node.js with Hono
- Database: SQLite preferred, MongoDB if SQLite not available
- Always use the `mongodb` npm package (never mongoose)
- HTTP client: native `fetch` only

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
- Rate limiting on auth, payments, and global endpoints
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
- Before using a component for the first time, read its source — many use compound patterns, not prop APIs

**Compound Components — these use sub-components, NOT props:**
```javascript
// Empty state — compound pattern (NOT <Empty icon={} title={}>)
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@stevederico/skateboard-ui/shadcn/ui/empty';

<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon"><Folder size={24} /></EmptyMedia>
    <EmptyTitle>No items yet</EmptyTitle>
    <EmptyDescription>Create your first item to get started.</EmptyDescription>
  </EmptyHeader>
  <Button>Create Item</Button>
</Empty>

// Card — compound pattern
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@stevederico/skateboard-ui/shadcn/ui/card';

// Dialog — compound pattern
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@stevederico/skateboard-ui/shadcn/ui/dialog';
```

**Header — use `children` for right-side actions:**
```javascript
import Header from '@stevederico/skateboard-ui/Header';

// Props: title, buttonTitle, onButtonTitleClick, children
// Use children for custom right-side content (buttons, dialogs, etc.)
<Header title="Projects">
  <Button size="sm"><Plus size={18} /> New Project</Button>
</Header>

// Simple text button shorthand:
<Header title="Settings" buttonTitle="Save" onButtonTitleClick={handleSave} />
```

**Standard imports:**
```javascript
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
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
import { Spinner } from '@stevederico/skateboard-ui/shadcn/ui/spinner';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@stevederico/skateboard-ui/shadcn/ui/empty';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { CircleAlert } from 'lucide-react';

function DealsView() {
  const { data, loading, error, refetch } = useListData('/deals');

  // Loading state
  if (loading) return <div className="flex flex-1 items-center justify-center"><Spinner /></div>;

  // Error state
  if (error) return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon"><CircleAlert size={24} /></EmptyMedia>
        <EmptyTitle>Failed to load deals</EmptyTitle>
        <EmptyDescription>{error}</EmptyDescription>
      </EmptyHeader>
      <Button onClick={refetch}>Try again</Button>
    </Empty>
  );

  // Data state
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

## Reference Documentation

When working with these libraries, consult the provided documentation before making assumptions.

| Library | Documentation URL |
|---|---|
| shadcn/ui | https://ui.shadcn.com/llms.txt |
| Vite | https://vite.dev/llms.txt |
| Hono | https://hono.dev/llms.txt |
| Tailwind CSS v4 | https://raw.githubusercontent.com/tailwindlabs/tailwindcss.com/refs/heads/md-endpoints/llms.txt |

## Documentation

**Reference:**
- [Architecture](docs/ARCHITECTURE.md) - Application Shell pattern, production config
- [Migration](docs/MIGRATION.md) - Upgrade between versions
- [Deployment](docs/DEPLOY.md) - Vercel, Render, Netlify, Docker
- [API Reference](docs/API.md) - REST endpoint documentation
- [Schema](docs/SCHEMA.md) - Database schema reference

**Version:**
- skateboard@2.17.0
- skateboard-ui@2.10.1

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

Always read the README in the @stevederico/skateboard-ui package before working with components.
